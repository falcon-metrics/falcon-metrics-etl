import _, { cloneDeep } from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { Op, Sequelize } from 'sequelize';
import slugify from 'slugify';
import {
    calculateStepCategory,
    EventPointOrders,
    excludeItem, isDelayedSnapshot
} from '../../common/process_revision_utils';
import { IUnmappedWorkflowStepProcessor } from '../../common/unmapped_workflow_step';
import { Config, ConfigFactory } from '../../configuration/config';
import {
    EventDates, HistoryItem, IEventDateExtractor
} from '../../configuration/event_date_extractor';
import {
    BLOCKED_REASON_TAG,
    CustomFieldConfig,
    DISCARDED_REASON_TAG,
    ICustomFieldConfigs
} from '../../data/custom_fields_config';
import { IDatasource, ServiceDetails } from '../../data/datasource_aurora';
import { CustomFieldConfigModel } from '../../data/models/CustomFieldConfigModel';
import {
    IWorkItemTypeMap,
    Workflow,
    WorkflowStep,
    WorkItemTypeItem,
    WorkItemTypeMapItem
} from '../../data/work_item_type_aurora';
import { ILoadNeededNotifier } from '../../notifications/load_needed_notifier';
import {
    ChangeLogHistory,
    IRevisionProcessor,
    ItemStatus,
    RawItem
} from '../../process_interfaces/revision_process_interface';
import {
    diffInWholeDays,
    StateCategories,
    stateCategoryByDate,
    stateCategoryRelativeToDate
} from '../../utils/date_utils';
import { FG_COLOR } from '../../utils/log_colors';
import {
    CustomField,
    LinkedItem,
    StandardSnapshotItem,
    StandardStateItem
} from '../../workitem/interfaces';
import { IS3Client } from '../../workitem/s3_client';
import { translateCustomField } from './translate_customfield';
import { translateDemoData_Snapshot, translateDemoData_State } from './translate_demo_data';
import { translateJiraLinkedItems } from './translate_linked_items';
import { getFillersCount, processFlaggedRevisions } from './utils';
import { LogTags } from '../../utils/log_tags';
import { changeUndefinedToNull } from '../../utils/object_utils';

export type JiraHistoryItem = HistoryItem & {
    historyId: string;
    statusText: string;
    fromString: string;
    from: string;
};

type ApiTestStateItem = {
    "workItemId": string;
    "workItemType": string;
    "arrivalDate": string | null;
    "commitmentDate": string | null;
    "departureDate": string | null;
    "revision": number,
    "state": string;
    "stateCategory": string;
};

export enum RevisionTypes {
    STATE_CHANGE = 'state_change',
    ASSIGNEE_CHANGE = 'assignee_change',
    BLOCKED_REASON = 'blocked_reason',
    DISCARDED_REASON = 'discarded_reason',
    FLAGGED = 'flagged'
}

export type JiraRawItem = RawItem & {
    changelog: { histories: ChangeLogHistory[]; };
    key: string;
    fields: {
        summary: string;
        updated: string;
        issuetype: {
            id: string;
            name: string;
            subtask?: boolean;
        };
        created: string;
        project: {
            name: string;
            id: string;
        };
        assignee?: {
            displayName: string;
        };
        status: {
            id: string;
            name: string;
            statusCategory: {
                name: string;
                id: string;
            };
        };
        //TODO: include custom fields
        [propName: string]: any;
        //TODO: include links ie -> find out original, translated: [{"type": "clones", "workItemId": "SMB-6162"}]

        resolution?: {
            name: string;
        };
    };
};
type JiraRawSnapshotItem = JiraRawItem & {
    flomatikaSnapshotDate?: string;
    historyId?: string;
    isFiller?: boolean;
    flomatikaArrivalDate?: DateTime;
    flomatikaCommitmentDate?: DateTime;
    flomatikaDepartureDate?: DateTime;
    previousRevision?: any;
    createFillersCount?: number;
    isDelayed?: boolean;
    stepCategory?: string;
    assignee?: string;
    type: RevisionTypes;
    blockedReason?: string;
    discardedReason?: string;
    flagged?: boolean;
    from?: string;
    to?: string;
};

/**
 * Name of the Parent Link field in jira server
 */
const PARENT_LINK_JIRA_SERVER = 'customfield_15503';

export class JiraRevisionProcessor implements IRevisionProcessor {
    private s3Client: IS3Client;
    private workItemTypeMap: IWorkItemTypeMap;
    private eventDateExtractor: IEventDateExtractor;
    private stateLoadNotifier: ILoadNeededNotifier;
    private snapshotLoadNotifier: ILoadNeededNotifier;
    private customFieldConfig: ICustomFieldConfigs;
    private orgId: string;
    private datasourceId: string;
    private logger: Logger;
    private datasource: IDatasource;
    private unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
    readonly DEMO_ORG_ID = 'flomatika-demo';
    readonly DEMO_DATASOURCE_ID = '55F599CA-98BA-4924-9B04-441678F030A6';
    readonly FLOMATIKA_ORG_ID = 'flomatika';
    private database: Sequelize;
    private flaggedFieldNames = new Set([
        'Impediment',
        // Portuguese
        'Impedimento'
    ]);
    private _config?: Config;
    private readonly configFactory: ConfigFactory;

    constructor(opt: {
        s3Client: IS3Client;
        workItemTypeMap: IWorkItemTypeMap;
        eventDateExtractor: IEventDateExtractor;
        customFieldConfig: ICustomFieldConfigs;
        stateLoadNotifier: ILoadNeededNotifier;
        snapshotLoadNotifier: ILoadNeededNotifier;
        database: Sequelize;
        logger: Logger;
        orgId: string;
        datasourceId: string;
        datasource: IDatasource;
        unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
        configFactory: ConfigFactory;
    }) {
        this.s3Client = opt.s3Client;
        this.workItemTypeMap = opt.workItemTypeMap;
        this.stateLoadNotifier = opt.stateLoadNotifier;
        this.snapshotLoadNotifier = opt.snapshotLoadNotifier;
        this.eventDateExtractor = opt.eventDateExtractor;
        this.customFieldConfig = opt.customFieldConfig;
        this.orgId = opt.orgId;
        this.datasourceId = opt.datasourceId;
        this.logger = opt.logger;
        this.datasource = opt.datasource;
        this.unmappedWorkflowStep = opt.unmappedWorkflowStep;
        this.database = opt.database;
        this.configFactory = opt.configFactory;
        this.logger = opt.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.TRANSFORM],
        });

    }
    async initConfig() {
        this._config = await this.configFactory.create();
    }
    get config(): Config {
        if (!this._config) {
            throw new Error('config not initailized');
        }
        return this._config;
    }
    async getWorkItemFromS3(s3Key: string): Promise<JiraRawItem> {
        const s3Item = await this.s3Client.getItemFromKey(s3Key);
        const jcItem = s3Item as JiraRawItem;
        return jcItem;
    }
    async processS3Object(s3Key: string): Promise<string> {
        const jcItem = await this.getWorkItemFromS3(s3Key);

        return await this.processRevisions(jcItem);
    }
    async processRevisions(jcItem: JiraRawItem): Promise<string> {
        await this.initConfig();
        const invokationId = Math.floor(Math.random() * 1000);

        const orgIdOfItem = jcItem.flomatikaFields.orgId;
        const datasourceOfItem = jcItem.flomatikaFields.datasourceId;

        const blockedReasonFieldId = await this.customFieldConfig.getCustomFieldByTag(this.orgId, this.datasourceId, BLOCKED_REASON_TAG);
        const discardedReasonFieldId = await this.customFieldConfig.getCustomFieldByTag(this.orgId, this.datasourceId, DISCARDED_REASON_TAG);

        let allRevisions = this.getRevisions(
            jcItem,
            jcItem.changelog?.histories,
            blockedReasonFieldId,
            discardedReasonFieldId
        );

        // Use only the state change revisions to identify the workflow
        let revisions = allRevisions.filter(r => r.type === RevisionTypes.STATE_CHANGE);

        const workflow = await this.identifyWorkflow(jcItem, orgIdOfItem, datasourceOfItem);
        if (!workflow) {
            return `Cannot find workflow for item ${JSON.stringify(
                jcItem.flomatikaFields,
            )}`;
        }
        const unmappedWorkflowSteps = this.getUnmappedWorkflowSteps(
            {
                statusId: jcItem.fields.status.id,
                statusName: jcItem.fields.status.name,
            },
            revisions,
            workflow,
        );

        if (unmappedWorkflowSteps && unmappedWorkflowSteps.length) {
            for (const unmappedStep of unmappedWorkflowSteps) {
                this.logger.info(({
                    message: `Saving unmapped workflow step`,
                    workItemId: jcItem.flomatikaFields.workItemId,
                    projectName: jcItem.fields.project.name,
                    projectId: jcItem.fields.project.id,
                    datasourceId: this.config.datasource.datasourceId,
                    orgId: this.orgId,
                    tags: [LogTags.TRANSFORM, LogTags.UNMAPPED_WORKFLOW_STEPS],
                    unmappedStep,
                    revisions,
                    allRevisions,
                    jcItem
                }));
                await this.mapWorkflowStep(workflow, unmappedStep);
            }
        }


        const workflowStep = await this.identifyWorkflowStep(
            jcItem,
            workflow,
            orgIdOfItem,
            datasourceOfItem,
        );
        const eventDates = await this.getEventDates(revisions, workflow, workflowStep);


        // We cannot find out why this was implemented. Commenting this for now
        // Check FLO-3359 for details
        // if (excludeItem(jcItem.flomatikaFields, eventDates)) {
        //     this.logger.info(
        //         `${JSON.stringify(
        //             jcItem.flomatikaFields,
        //         )} is excluded because it is before exclude before date`,
        //     );
        //     return 'Ok';
        // }


        const stateCategory = this.getStateCategory(eventDates);

        let { stateItem, workItemType, workItemTypeMap } = await this.translateWorkItem(
            jcItem,
            eventDates,
            stateCategory,
            workflowStep,
            orgIdOfItem,
            datasourceOfItem,
        );

        if (orgIdOfItem === this.DEMO_ORG_ID) {
            stateItem = translateDemoData_State(stateItem);
        }

        const response = await this.notifyStateItemLoader(
            orgIdOfItem,
            datasourceOfItem,
            stateItem,
        );

        await this.createAndLoadSnapshot(
            jcItem,
            allRevisions,
            eventDates,
            workflow,
            workItemType,
            workItemTypeMap,
            orgIdOfItem,
            datasourceOfItem,
            stateItem.title,
        );

        return response;
    }
    getRevisions(
        stateItem: JiraRawItem,
        histories: ChangeLogHistory[],
        // These 2 come from settings
        blockedReasonFieldId?: string,
        discardedReasonFieldId?: string
    ): JiraHistoryItem[] {
        let historyItems = new Array<JiraHistoryItem>();

        // I had to add a type override here, without this there is an error
        // Somewhere in the code we might be checking for blank strings
        // and that might fail so leaving that as is with a type override
        const initial: any = {
            from: '',
            fromString: '',
        };
        let firstAssignee: string | undefined;
        if (histories) {
            histories.forEach((history) => {
                history.items.forEach((item) => {
                    let historyId = history.id;

                    // Flag removed
                    if (
                        item.field === 'Flagged' &&
                        (item.to === '' && item.toString === '')
                    ) {
                        const statusChange = {
                            // Setting these two because ther is a 
                            // filter below to to filter out
                            // empty statusId and empty statudName
                            statusId: 'flagged',
                            statusName: 'flagged',
                            changedDate: DateTime.fromISO(
                                history.created,
                            ).toUTC(),
                            historyId: historyId,
                            statusText: 'flagged',
                            fromString: item.fromString,
                            from: item.from,
                            revision: historyId,
                            type: RevisionTypes.FLAGGED,
                            flagged: false,
                        };
                        historyItems.push(statusChange);
                    }
                    if (
                        (item.to && item.toString) &&
                        (
                            item.field === 'status' ||
                            item.field === 'assignee' ||
                            (blockedReasonFieldId && item.fieldId === blockedReasonFieldId) ||
                            (discardedReasonFieldId && item.fieldId === discardedReasonFieldId) ||
                            item.field === 'Flagged'
                        )
                    ) {
                        // Adding a type override here to debug
                        let type: RevisionTypes = '' as any;
                        let flagged = false;
                        let assignee, blockedReason, discardedReason;
                        let statusText = '';


                        if (item.field === 'status') {
                            type = RevisionTypes.STATE_CHANGE;
                            statusText = item.toString;
                        } else if (item.field === 'Flagged') {
                            type = RevisionTypes.FLAGGED;
                            flagged = true;
                            statusText = '';
                        } else if (item.field === 'assignee') {
                            type = RevisionTypes.ASSIGNEE_CHANGE;
                            assignee = item.toString;
                            statusText = '';
                        } else if (blockedReasonFieldId && item.fieldId === blockedReasonFieldId) {
                            type = RevisionTypes.BLOCKED_REASON;
                            blockedReason = item.toString;
                            statusText = '';
                        } else if (discardedReasonFieldId && item.fieldId === discardedReasonFieldId) {
                            type = RevisionTypes.DISCARDED_REASON;
                            discardedReason = item.toString;
                            statusText = '';
                        }

                        const statusChange = {
                            statusId: item.to,
                            statusName: item.toString,
                            changedDate: DateTime.fromISO(
                                history.created,
                            ).toUTC(),
                            historyId: historyId,
                            statusText,
                            fromString: item.fromString,
                            from: item.from,
                            revision: historyId,
                            type,
                            assignee,
                            blockedReason,
                            discardedReason,
                            flagged
                        };
                        historyItems.push(statusChange);
                    }
                });
            });
        }

        historyItems.sort((a, b) => {
            return a.changedDate < b.changedDate
                ? -1
                : a.changedDate > b.changedDate
                    ? 1
                    : 0;
        }); //the api return may be in incorrect order, so to deduct the initial state we need to sort it first asc.

        // Initialize the first revision
        const stateChanges = historyItems.filter(hi => hi.type === RevisionTypes.STATE_CHANGE);
        if (stateChanges.length > 0) {
            initial.from = stateChanges[0].from;
            initial.fromString = stateChanges[0].fromString;
        } else {
            initial.from = stateItem.fields.status.id;
            initial.fromString = stateItem.fields.status.name;
        }

        const firstAssigneeChange = historyItems.filter(r => r.type === RevisionTypes.ASSIGNEE_CHANGE)[0];
        if (firstAssigneeChange !== undefined && firstAssigneeChange.fromString !== null) {
            firstAssignee = firstAssigneeChange.fromString;
        }

        // Since there isn't a change log entry when the item is created
        // we need to insert one with the original status
        // otherwise we have a hole in our snapshots
        const initialStatus: JiraHistoryItem = {
            statusId: initial.from,
            from: initial.from,
            changedDate: DateTime.fromISO(stateItem.fields.created).toUTC(),
            statusText: initial.fromString,
            statusName: initial.fromString,
            historyId: '0',
            revision: '0',
            fromString: '',
            type: RevisionTypes.STATE_CHANGE,
        };

        const firstAssigneeRevision: JiraHistoryItem = {
            statusId: initial.from,
            from: initial.from,
            changedDate: DateTime.fromISO(stateItem.fields.created).toUTC(),
            statusText: initial.fromString,
            statusName: initial.fromString,
            historyId: '0',
            revision: '0',
            fromString: '',
            assignee: firstAssignee,
            type: RevisionTypes.ASSIGNEE_CHANGE,
        };

        historyItems = [initialStatus, firstAssigneeRevision]
            .concat(historyItems)
            .filter(
                (statusChange) =>
                    statusChange.statusId && statusChange.statusName,
            );
        return historyItems;
    }
    async identifyWorkflow(
        jiraItem: JiraRawItem,
        overrideOrgId?: string,
        overrideDatasourceId?: string,
    ): Promise<Workflow | undefined> {
        const currentOrgId = overrideOrgId ?? this.orgId;

        const workflowId = slugify(
            `${currentOrgId}.${jiraItem.fields.project.id}.${jiraItem.fields.issuetype.name}`,
        ).toLowerCase();

        let workflow = this.config.workflows.find(w => w.workflowId === workflowId);

        if (!workflow) {
            // Edge case. The name of the work item type can be changed, but the id remains same
            // So find the workflow by the id instead of the slugified id that uses the name of the issue type
            const issueTypeId = jiraItem.fields.issuetype.id;
            const projectId = jiraItem.fields.project.id;
            const findResult = this.config.workItemTypeMaps.find(witm => (
                witm.datasourceWorkItemId === issueTypeId && witm.projectId === projectId
            ));

            if (findResult) {
                const workflowId = findResult.workflowId!;
                this.logger.info(({
                    message: 'Found workflow by id',
                    findResult,
                    workflowId,
                    orgId: this.orgId,
                    projectId,
                    jiraItem
                }));
                workflow = this.config.workflows.find(w => w.workflowId === workflowId);
            }
        }
        if (!workflow) {
            this.logger.error(({
                message: 'Cannot find workflow for item',
                workItemId: jiraItem.flomatikaFields.workItemId,
                projectName: jiraItem.fields.project.name,
                projectId: jiraItem.fields.project.id,
                workflowId,
                datasourceId: this.datasourceId,
                orgId: currentOrgId,
            }));
        }
        return workflow;
    }

    async identifyWorkflowStep(
        item: JiraRawItem,
        workflow: Workflow,
        overrideOrgId?: string,
        overrideDatasourceId?: string,
    ): Promise<WorkflowStep> {
        //TODO: make it find the workflow step in local memory
        const workflowId = workflow.workflowId;
        const isState = true;
        const workflowStep = await this.workItemTypeMap.getWorkflowStep(
            overrideOrgId ?? this.orgId,
            overrideDatasourceId ?? this.datasourceId,
            item.fields.issuetype.id,
            workflowId,
            item.fields.status.name,
            item.fields.status.id,
            isState,
        );
        if (!workflowStep) {
            this.logger.error(({
                message: 'Cannot find workflow step for item',
                workItemId: item.flomatikaFields.workItemId,
                projectName: item.fields.project.name,
                projectId: item.fields.project.id,
                workflowId,
                datasourceId: this.datasourceId,
                orgId: item.flomatikaFields.orgId,
            }));
            throw Error(
                `Cannot find workflow step for item ${JSON.stringify(item)}`,
            );
        }
        return workflowStep;
    };


    getUnmappedWorkflowSteps(
        itemCurrentStatus: ItemStatus,
        histories: HistoryItem[],
        workflow: Workflow,
    ): WorkflowStep[] {
        return this.unmappedWorkflowStep.getUnmappedWorkflowSteps(
            itemCurrentStatus,
            histories,
            workflow,
        );
    }
    async getEventDates(
        revisions: HistoryItem[],
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): Promise<EventDates> {
        //We dont need service Url and access token for calling in new extract, just to fill in the arguments
        const eventDates = this.eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflowStep,
        );
        return eventDates;
    };
    getStateCategory(eventDates: EventDates): StateCategories {
        return stateCategoryByDate(
            eventDates.arrival?.toISO() ?? undefined,
            eventDates.commitment?.toISO() ?? undefined,
            eventDates.departure?.toISO() ?? undefined,
        );
    }
    async getCustomFieldsConfigs(
        orgId: string,
        datasourceId: string,
    ): Promise<CustomFieldConfig[]> {
        return await this.customFieldConfig.getCustomFieldConfigs(
            orgId,
            datasourceId,
        );
    }
    async translateCustomFields(
        item: JiraRawItem,
        overrideOrgId?: string,
        overrideDatasourceId?: string): Promise<CustomField[]> {
        const customFieldConfigs = await this.getCustomFieldsConfigs(
            overrideOrgId ?? this.orgId,
            overrideDatasourceId ?? this.datasourceId,
        );
        let customFields: Array<CustomField> = [];
        for (const customFieldConfig of customFieldConfigs) {
            const configs: Array<CustomField> = translateCustomField(
                item.fields,
                customFieldConfig.datasourceFieldName,
                customFieldConfig.displayName,
                customFieldConfig.type,
            );
            customFields = customFields.concat(configs);
        }
        return customFields;
    };
    translateLinkedItems(parentWorkItem: JiraRawItem): LinkedItem[] {
        return translateJiraLinkedItems(parentWorkItem);
    }

    async getServiceDetails(): Promise<ServiceDetails> {
        const serviceDetails = await this.datasource.getServiceDetails(
            this.orgId,
            this.datasourceId,
        );
        if (!serviceDetails) {
            throw Error(
                `Cannot find service details with org:${this.orgId}, datasource: ${this.datasourceId}`,
            );
        }
        return serviceDetails;
    }
    async mapWorkflowStep(
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): Promise<void> {

        //get the statusCategory name
        //send to loader
        await this.unmappedWorkflowStep.mapWorkflowStep(workflow, workflowStep);
    };
    createSnapshots(
        jcItem: JiraRawItem,
        statusChange: JiraHistoryItem[],
        eventDates: EventDates,
    ): JiraRawSnapshotItem[] {
        const snapshotItems: JiraRawSnapshotItem[] = [];

        const snapshotTemplate: JiraRawSnapshotItem = {
            ...cloneDeep(jcItem),
            // Set the default type to state change. 
            // Because state type is a required property
            // This will be overwritten below in the loop
            type: RevisionTypes.STATE_CHANGE
        };
        snapshotTemplate.flomatikaArrivalDate =
            eventDates.arrival ?? DateTime.fromISO(jcItem.fields.created);
        snapshotTemplate.flomatikaCommitmentDate = eventDates.commitment;
        snapshotTemplate.flomatikaDepartureDate = eventDates.departure;
        const sortedChanges = _.sortBy(statusChange, s => s.changedDate.toMillis());
        //loop through index, so can get next revisions
        for (let revIdx = 0; revIdx < sortedChanges.length; revIdx++) {

            const currChange = sortedChanges[revIdx];
            const currChangeSnapshotDate = currChange.changedDate
                .toUTC();

            const snapshotItem = cloneDeep(snapshotTemplate);
            snapshotItem.fields.status.name = currChange.statusText;
            snapshotItem.fields.status.id = currChange.statusId!;
            snapshotItem.fields.updated = currChange.changedDate.toISO()!;
            snapshotItem.flomatikaSnapshotDate = currChangeSnapshotDate.toISO()!;
            snapshotItem.historyId = currChange.historyId;
            snapshotItem.isFiller = false;
            // This is a legacy property
            // We're not using fillers anymore
            snapshotItem.createFillersCount = 0;
            snapshotItem.isDelayed = isDelayedSnapshot(
                eventDates,
                currChange.revision!,
            );
            snapshotItem.fields.resolution = jcItem.fields.resolution;

            snapshotItem.type = currChange.type;
            snapshotItem.assignee = currChange.assignee;
            snapshotItem.blockedReason = currChange.blockedReason;
            snapshotItem.discardedReason = currChange.discardedReason;
            snapshotItem.flagged = currChange.flagged;

            snapshotItems.push(snapshotItem);
        }
        return snapshotItems;
    }
    translateSnapshots(
        rawSnapshots: JiraRawSnapshotItem[],
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
        workItemTypeMap: WorkItemTypeMapItem,
        eventDates: EventDates,
        overrideOrgId?: string,
        stateItemTitle?: string | null,
    ): StandardSnapshotItem[] {
        const snapshots: StandardSnapshotItem[] = [];
        const flomatikaWorkItemTypeId = workItemType.id;
        const workflowId = workflow.workflowId;

        const promises = rawSnapshots.map(async (rawSnapshot) => {
            const item = rawSnapshot;


            const changedDate = DateTime.fromISO(item.fields.updated)
                .toUTC();

            const stateCategory = stateCategoryRelativeToDate(
                changedDate,
                item.flomatikaArrivalDate,
                item.flomatikaCommitmentDate,
                item.flomatikaDepartureDate,
            );

            const eventPointOrders: EventPointOrders = {
                arrivalPointOrder: eventDates.arrivalPointOrder!,
                commitmentPointOrder: eventDates.commitmentPointOrder!,
                departurePointOrder: eventDates.departurePointOrder!,
            };

            let stateOrder = -999, stateType = 'not applicable', stepCategory = 'not applicable';

            // Find workflow steps only for state change revisions
            // Workflow step is not applicable for other types of revisions
            if (rawSnapshot.type === RevisionTypes.STATE_CHANGE) {
                const workflowStep = workflow.workflowSteps?.find(
                    (step: WorkflowStep) => {
                        return (
                            step.id === rawSnapshot.fields.status.id &&
                            step.name === rawSnapshot.fields.status.name
                        );
                    },
                );

                if (!workflowStep) {
                    this.logger.error({
                        message: 'Cannot find workItemType for the workItemType',
                        workflowId,
                        item,
                    });
                    return;
                }

                stateOrder = workflowStep.order!;
                stateType = workflowStep.stateType!;
                stepCategory = calculateStepCategory(stateOrder, eventPointOrders);
            }

            const projectId = item.fields.project.id;
            let snapshotItem: StandardSnapshotItem = {
                flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
                flomatikaWorkItemTypeName: workItemType.displayName!,
                flomatikaWorkItemTypeLevel: workItemType.level!,
                flomatikaSnapshotDate: item.flomatikaSnapshotDate!,
                changedDate: changedDate.toISO()!,
                workItemId: item.key,
                title: stateItemTitle ?? item.fields.summary,
                workItemType: workItemType.displayName!,
                state: item.fields.status.name,
                stateCategory,
                stateType,
                stateOrder: stateOrder.toString(),
                assignedTo: item.fields.assignee
                    ? item.fields.assignee.displayName
                    : undefined,
                revision: Number(item.historyId!),
                isFiller: item.isFiller!,
                flomatikaCreatedBy: 'etl3',
                // This is a legacy property. We're not using fillers anymore
                createFillersCount: 0,
                previousRevision: item.previousRevision,
                projectId,
                isDelayed: item.isDelayed,
                stepCategory,
                resolution: item.fields.resolution?.name,

                type: item.type,
                assignee: item.assignee,
                blockedReason: item.blockedReason,
                discardedReason: item.discardedReason,
                flagged: item.flagged,
                // This field will be overwritten by the load processor.
                // Adding it to fix the typescript's missing property error
                partitionKey: `snapshot#${this.orgId}`,
            };

            if ((overrideOrgId ?? this.orgId) === this.DEMO_ORG_ID) {
                snapshotItem = translateDemoData_Snapshot(snapshotItem);
            }

            snapshots.push(snapshotItem);
        });

        return snapshots;
    }
    async translateWorkItem(
        item: JiraRawItem,
        eventDates: EventDates,
        stateCategory: StateCategories,
        workflowStep: WorkflowStep,
        overrideOrgId?: string,
        overrideDatasourceId?: string,
    ): Promise<{
        stateItem: StandardStateItem;
        workItemType: WorkItemTypeItem;
        workItemTypeMap: WorkItemTypeMapItem;
    }> {
        const projectId = item.fields.project.id;
        const flomatikaWorkItemTypeId =
            await this.workItemTypeMap.getWorkItemTypeId(
                overrideOrgId ?? this.orgId,//overrideOrgId
                overrideDatasourceId ?? this.datasourceId,
                item.fields.issuetype.id,
            );
        const workItemType = await this.workItemTypeMap.getWorkItemType(
            overrideOrgId ?? this.orgId,
            overrideDatasourceId ?? this.datasourceId,
            flomatikaWorkItemTypeId!,
        );

        if (!workItemType) {
            throw Error(
                `Cannot find work item type for item ${JSON.stringify(item)}`,
            );
        }

        const workItemTypeMap = await this.workItemTypeMap.getWorkItemTypeMap(
            overrideOrgId ?? this.orgId,
            overrideDatasourceId ?? this.datasourceId,
            flomatikaWorkItemTypeId!,
            projectId
        );
        if (!workItemTypeMap) {
            throw Error(
                `Cannot find work item type map for item ${JSON.stringify(item)}`,
            );
        }

        const customFields = await this.translateCustomFields(item);
        let parentId;

        // fields.parent doesnt exist in jira server
        // For Jira cloud: Parent Link (Was part of roadmaps),  Sub-Task
        // For Jira server: Sub-Task
        if (item.fields.parent) {
            parentId = item.fields.parent.key;
        }
        // For Jira server only - to get the parent of the items through parent link (for roadmaps)
        else if (item.fields[PARENT_LINK_JIRA_SERVER]) {
            parentId = item.fields[PARENT_LINK_JIRA_SERVER];
        }
        // For both Jira cloud and Jira server - Get the parent of the item through epic link
        else {
            const epicCustomFieldConfigs = await this.customFieldConfig.getByType(
                overrideOrgId ?? this.orgId,
                overrideDatasourceId ?? this.datasourceId,
                'epic',
            );
            if (epicCustomFieldConfigs && epicCustomFieldConfigs.length) {
                const epicLinkCustomFieldId = epicCustomFieldConfigs[0].datasourceFieldName;
                parentId = item.fields[epicLinkCustomFieldId];
            }
        }

        const flagged = this.isItemFlagged(item);

        const linkedItems = this.translateLinkedItems(item);
        const stateItem: StandardStateItem = {
            flomatikaWorkItemTypeId,
            flomatikaWorkItemTypeName: workItemType.displayName!,
            flomatikaWorkItemTypeLevel: workItemType.level!,

            // SLE from workitem type maps 
            // See Jira item for details
            flomatikaWorkItemTypeServiceLevelExpectationInDays:
                workItemTypeMap.serviceLevelExpectationInDays!,

            changedDate: item.fields.updated,
            workItemId: item.key,
            title: item.fields.summary,
            workItemType: workItemType.displayName!,
            state: item.fields.status.name,
            stateCategory,
            stateType: workflowStep.stateType!,
            stateOrder: workflowStep.order!.toString(),
            assignedTo: item.fields.assignee
                ? item.fields.assignee.displayName
                : undefined,
            arrivalDate: eventDates.arrival?.toISO(),
            commitmentDate: eventDates.commitment?.toISO(),
            departureDate: eventDates.departure?.toISO(),
            projectId,
            isDelayed: eventDates.isDelayed ?? false,
            customFields,
            linkedItems,
            parentId,
            stepCategory: eventDates.stepCategory!,
            resolution: item.fields.resolution?.name,
            // This field will be overwritten by the load processor.
            // Adding it to fix the typescript's missing property error
            partitionKey: `state#${this.orgId}`,
            flagged
        };

        return { stateItem, workItemType, workItemTypeMap };
    }
    async createAndLoadSnapshot(
        jcItem: JiraRawItem,
        histories: JiraHistoryItem[],
        eventDates: EventDates,
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
        workItemTypeMap: WorkItemTypeMapItem,
        overrideOrgId?: string,
        overrideDatasourceId?: string,
        stateItemTitle?: string | null,
    ): Promise<void> {
        const rawSnapshots = this.createSnapshots(
            jcItem,
            histories,
            eventDates,
        );
        const translatedSnapshots = this.translateSnapshots(
            rawSnapshots,
            workflow,
            workItemType,
            workItemTypeMap,
            eventDates,
            overrideOrgId,
            stateItemTitle,
        );
        const transformedSnapshots = processFlaggedRevisions(translatedSnapshots);

        await Promise.all(
            transformedSnapshots.map(async (snapshot) => {
                await this.notifySnapshotItemLoader(
                    overrideOrgId ?? this.orgId,
                    overrideDatasourceId ?? this.datasourceId,
                    snapshot,
                );
            }),
        );
    }
    async notifyStateItemLoader(
        orgId: string,
        datasourceId: string,
        stateItem: StandardStateItem,
    ): Promise<string> {
        changeUndefinedToNull(stateItem);

        this.logger.info(({
            message: 'Sending item  to state loader',
            workItemId: stateItem.workItemId,
            orgId,
            datasourceId,
            tags: [LogTags.EXTRACT]
        }));

        return await this.stateLoadNotifier.notify(
            orgId,
            datasourceId,
            stateItem,
        );
    }
    async notifySnapshotItemLoader(
        orgId: string,
        datasourceId: string,
        snapshotItem: StandardSnapshotItem,
    ): Promise<string> {
        changeUndefinedToNull(snapshotItem);

        this.logger.info(({
            message: 'Sending item to snapshot loader',
            workItemId: snapshotItem.workItemId,
            revision: snapshotItem.revision,
            orgId,
            datasourceId,
            tags: [LogTags.EXTRACT]
        }));
        return await this.snapshotLoadNotifier.notify(
            orgId,
            datasourceId,
            snapshotItem,
        );
    };

    /**
     * Check all the fields, if there is field that looks like this,
     * return true
     *
        ```
        "fields": {
            "customfield_10021": [
                {
                    "self": "https://example.atlassian.net/rest/api/3/customFieldOption/10019",
                    "value": "Impediment",
                    "id": "10019"
                }
            ]
        }
        ```
     */
    private isItemFlagged(item: JiraRawItem): boolean {
        let isFlagged = false;
        Object
            .keys(item.fields)
            .forEach((fieldName) => {
                const fieldValue = item.fields[fieldName];
                if (
                    Array.isArray(fieldValue)
                    && fieldValue.length > 0
                    && this.flaggedFieldNames.has(fieldValue[0].value)
                ) {
                    isFlagged = true;
                }
            });
        return isFlagged;
    }
}



