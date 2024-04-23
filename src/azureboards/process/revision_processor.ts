import _ from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { getWorkflowId } from '../../common/extract_utils';
import {
    calculateStepCategory,
    EventPointOrders,
    excludeItem,
    isDelayedSnapshot
} from '../../common/process_revision_utils';
import { IUnmappedWorkflowStepProcessor } from '../../common/unmapped_workflow_step';
import {
    EventDates,
    HistoryItem, IEventDateExtractor
} from '../../configuration/event_date_extractor';
import {
    CustomFieldConfig,
    ICustomFieldConfigs
} from '../../data/custom_fields_config';
import {
    IWorkItemTypeMap,
    Workflow,
    WorkflowStep,
    WorkItemTypeItem,
    WorkItemTypeMapItem
} from '../../data/work_item_type_aurora';
import { RevisionTypes } from '../../jiracloud/process/revision_processor';
import { getFillersCount, processFlaggedRevisions } from '../../jiracloud/process/utils';
import { ILoadNeededNotifier } from '../../notifications/load_needed_notifier';
import {
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
import {
    CustomField,
    LinkedItem,
    StandardSnapshotItem,
    StandardStateItem
} from '../../workitem/interfaces';
import { IS3Client } from '../../workitem/s3_client';
import { translateAdoLinkedItems } from './translation';
import { LogTags } from '../../utils/log_tags';
import { changeUndefinedToNull } from '../../utils/object_utils';
export type AdoRevisionItem = {
    ChangedDate: string;
    State: string;
    Revision: string;
    Project?: { ProjectId: string; };
    WorkItemId: string;
    StateCategory: string;
    Reason?: string;

    type: RevisionTypes;
    flagged: boolean;
    assignee?: string;
    blockedReason?: string;
    discardedReason?: string;
};

//   "Links": [
//     {
//         "WorkItemLinkSK": 332686605,
//         "SourceWorkItemId": 7211,
//         "TargetWorkItemId": 7203,
//         "CreatedDate": "2021-11-29T15:44:13.613+11:00",
//         "DeletedDate": "9999-01-01T11:00:00+11:00",
//         "Comment": "",
//         "LinkTypeId": -2,
//         "LinkTypeReferenceName": "System.LinkTypes.Hierarchy-Reverse",
//         "LinkTypeName": "Parent",
//         "LinkTypeIsAcyclic": true,
//         "LinkTypeIsDirectional": true,
//         "AnalyticsUpdatedDate": "2021-11-29T04:44:17.3333333Z",
//         "ProjectSK": "8223e21c-c9f2-420c-8bc4-a9778c6739f0"
//     }
// ]
export interface RawAdoItemLink {
    LinkTypeName: string;
    TargetWorkItemId: string;
}
export type AdoRawItem = RawItem & {
    WorkItemId: string;
    revisions: AdoRevisionItem[];
    Project: {
        ProjectId: string;
        ProjectName: string;
    };
    WorkItemType: string;
    ParentWorkItemId: string;
    AssignedTo?: {
        UserName: string;
    };
    Title: string;
    State: string;
    ChangedDate: string;
    Reason?: string;
    Links: RawAdoItemLink[];
    // [propName: string]: any;
};
// flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
// flomatikaWorkItemTypeName: workItemType.displayName,
// flomatikaWorkItemTypeLevel: workItemType.level,
// flomatikaSnapshotDate: item.flomatikaSnapshotDate,
// changedDate: item.changedDate,
// workItemId: item.workItemId,
// title: item.title,
// workItemType: item.workItemType,
// state: item.state,
// stateCategory: workflowStep.stateCategory,
// stateType: workflowStep.stateType,
// stateOrder: workflowStep.order,
// assignedTo: item.assignedTo
//     ? item.assignedTo.UserName
//     : undefined,
// revision: item.revision,
// isFiller: item.isFiller,
// flomatikaCreatedBy: 'etl',
// createFillersCount: item.createFillersCount,
// previousRevision: item.previousRevision,
// projectId: item.project.ProjectId,
type AdoSnapshotRawItem = AdoRawItem & {
    flomatikaSnapshotDate?: string;
    historyId?: string;
    isFiller?: boolean;
    /**
     * @deprecated
     */
    createFillersCount: number;
    flomatikaArrivalDate?: DateTime;
    flomatikaCommitmentDate?: DateTime;
    flomatikaDepartureDate?: DateTime;
    previousRevision: any;
    Revision: number;
    isDelayed: boolean;
    stepCategory: string;
    type: RevisionTypes;
    assignee?: string;
    flagged: boolean;
    blockedReason?: string;
    discardedReason?: string;
};
export class AdoRevisionProcessor implements IRevisionProcessor {
    private s3Client: IS3Client;
    private workItemTypeMap: IWorkItemTypeMap;
    private eventDateExtractor: IEventDateExtractor;
    private stateLoadNotifier: ILoadNeededNotifier;
    private snapshotLoadNotifier: ILoadNeededNotifier;
    private customFieldConfig: ICustomFieldConfigs;
    private logger: Logger;
    private orgId: string;
    private datasourceId: string;
    private unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
    constructor(opt: {
        s3Client: IS3Client;
        workItemTypeMap: IWorkItemTypeMap;
        eventDateExtractor: IEventDateExtractor;
        customFieldConfig: ICustomFieldConfigs;
        stateLoadNotifier: ILoadNeededNotifier;
        snapshotLoadNotifier: ILoadNeededNotifier;
        logger: Logger;
        orgId: string;
        datasourceId: string;
        unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
    }) {
        this.s3Client = opt.s3Client;
        this.workItemTypeMap = opt.workItemTypeMap;
        this.eventDateExtractor = opt.eventDateExtractor;
        this.stateLoadNotifier = opt.stateLoadNotifier;
        this.snapshotLoadNotifier = opt.snapshotLoadNotifier;
        this.customFieldConfig = opt.customFieldConfig;
        this.logger = opt.logger;
        this.orgId = opt.orgId;
        this.datasourceId = opt.datasourceId;
        this.unmappedWorkflowStep = opt.unmappedWorkflowStep;
        this.logger = opt.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.TRANSFORM],
        });
    }
    async getWorkItemFromS3(s3Key: string): Promise<AdoRawItem> {
        const s3Item = await this.s3Client.getItemFromKey(s3Key);
        const adoItem = s3Item as AdoRawItem;
        return adoItem;
    }
    async processS3Object(s3Key: string): Promise<string> {
        const adoItem = await this.getWorkItemFromS3(s3Key);
        return await this.processRevisions(adoItem);
    }
    async processRevisions(adoItem: AdoRawItem): Promise<string> {
        this.logger.info({
            message: 'Process Revision',
            workItemId: adoItem.flomatikaFields.workItemId,
            orgId: adoItem.flomatikaFields.orgId,
        });
        const { orgId, datasourceId } = adoItem.flomatikaFields;
        let allRevisions = this.getRevisions(
            adoItem,
            adoItem.revisions,
        );
        const stateChangeRevisions = allRevisions.filter(r => r.type === RevisionTypes.STATE_CHANGE);
        const workflow = await this.identifyWorkflow(adoItem);
        if (!workflow) {
            return `Cannot find workflow for item ${JSON.stringify(
                adoItem.flomatikaFields,
            )}`;
        }
        const unmappedWorkflowSteps = this.getUnmappedWorkflowSteps(
            // Using item.State here becuase that's how its done in getStateChangeRevisions
            { statusId: adoItem.State, statusName: adoItem.State },
            stateChangeRevisions,
            workflow,
        );
        if (unmappedWorkflowSteps && unmappedWorkflowSteps.length) {
            for (const unmappedStep of unmappedWorkflowSteps) {
                await this.mapWorkflowStep(workflow, unmappedStep);
            }
        }

        const workflowStep = await this.identifyWorkflowStep(adoItem, workflow);
        const eventDates = await this.getEventDates(stateChangeRevisions, workflow, workflowStep);

        // We cannot find out why this was implemented. Commenting this for now
        // Check FLO-3359 for details
        // if (excludeItem(adoItem.flomatikaFields, eventDates)) {
        //     this.logger.info(
        //         `${JSON.stringify(
        //             adoItem.flomatikaFields,
        //         )} is excluded because it is before exclude before date`,
        //     );
        //     return 'Ok';
        // }

        const stateCategory = this.getStateCategory(eventDates);

        const { stateItem, workItemType, workItemTypeMap } = await this.translateWorkItem(
            adoItem,
            eventDates,
            stateCategory,
            workflowStep,
        );
        const response = await this.notifyStateItemLoader(
            orgId,
            datasourceId,
            stateItem,
        );

        this.logger.info({
            message: 'After notifyStateItemLoader',
            workItemId: adoItem.flomatikaFields.workItemId,
            orgId: adoItem.flomatikaFields.orgId,
        });

        await this.createAndLoadSnapshot(
            adoItem,
            adoItem.revisions,
            eventDates,
            workflow,
            workItemType,
            workItemTypeMap
        );

        this.logger.info({
            message: 'After createAndLoadSnapshot',
            workItemId: adoItem.flomatikaFields.workItemId,
            orgId: adoItem.flomatikaFields.orgId,
        });
        return response;
    }
    getRevisions(
        item: AdoRawItem,
        histories: AdoRawItem['revisions'],
    ): HistoryItem[] {
        const workItemRevisions = histories
            .filter(
                (revision: any) =>
                    revision.WorkItemId === item.WorkItemId && revision.State,
            )
            .map((revision: AdoRevisionItem) => {
                return {
                    changedDate: DateTime.fromISO(revision.ChangedDate),
                    statusId: revision.State,
                    stateCategory: revision.StateCategory,
                    revision: revision.Revision,
                    workItemId: revision.WorkItemId,
                    projectId: revision.Project?.ProjectId,
                    statusName: revision.State,
                    type: revision.type,
                    assignee: revision.assignee,
                    flagged: revision.flagged,
                    blockedReason: revision.blockedReason,
                    discardedReason: revision.discardedReason,
                };
            });
        return workItemRevisions;
    }
    async identifyWorkflow(adoItem: AdoRawItem): Promise<Workflow | undefined> {
        const { orgId, datasourceId } = adoItem.flomatikaFields;
        const workflowId = getWorkflowId(
            orgId,
            adoItem.Project.ProjectId,
            adoItem.WorkItemType,
        );
        const workflow = await this.workItemTypeMap.getWorkflow(
            orgId,
            datasourceId,
            workflowId,
        );
        if (!workflow) {
            this.logger.error(({
                message: 'Cannot find workflow for item',
                workItemId: adoItem.WorkItemId,
                projectName: adoItem.Project.ProjectName,
                projectId: adoItem.Project.ProjectId,
                workflowId,
                datasourceId: this.datasourceId,
                orgId,
            }));
        }
        return workflow;
    }
    async identifyWorkflowStep(
        item: AdoRawItem,
        workflow: Workflow,
    ): Promise<WorkflowStep> {
        const lastRevision = item.revisions[item.revisions.length - 1];
        const workflowStep = workflow.workflowSteps?.find(
            (workflowStep: WorkflowStep) =>
                workflowStep.name! === lastRevision.State,
        );
        if (!workflowStep) {
            this.logger.error(({
                message: 'Cannot find workflow step for item',
                workItemId: item.WorkItemId,
                projectName: item.Project.ProjectName,
                projectId: item.Project.ProjectId,
                lastRevision: JSON.parse(JSON.stringify(lastRevision)),
                datasourceId: this.datasourceId,
                orgId: item.flomatikaFields.orgId,
                workflow: JSON.parse(JSON.stringify(workflow))
            }));
            throw Error(
                `Cannot find workflow step for item ${JSON.stringify(item)}`,
            );
        }
        return workflowStep;
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
    }
    getStateCategory(eventDates: EventDates): StateCategories {
        return stateCategoryByDate(
            eventDates.arrival?.toISO() ?? undefined,
            eventDates.commitment?.toISO() ?? undefined,
            eventDates.departure?.toISO() ?? undefined,
        );
    }
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
    async mapWorkflowStep(
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): Promise<void> {
        //get the statusCategory name
        //send to loader
        await this.unmappedWorkflowStep.mapWorkflowStep(workflow, workflowStep);
    }
    async getCustomFieldsConfigs(
        orgId: string,
        datasourceId: string,
        projectId?: string,
    ): Promise<CustomFieldConfig[]> {
        return await this.customFieldConfig.getCustomFieldConfigs(
            orgId,
            datasourceId,
            projectId,
        );
    }
    translateCustomField = (
        item: any,
        datasourceFieldName: string,
        displayName: string,
        type: string,
    ): Array<CustomField> => {
        const customFields: Array<CustomField> = [];
        const fieldValue: any = item[datasourceFieldName];

        if (!fieldValue) {
            return customFields;
        }

        //for fields that can multiple values, azure boards doesn't use an array,
        //the values are separated by ";", for example
        //"TagNames": "Onboarding; tag 3; tag2",

        if (typeof fieldValue === 'string' && fieldValue.includes(';')) {
            const values: string[] = fieldValue
                .split(';')
                .map((item: string) => item.trim());
            for (const value of values) {
                const customField: CustomField = {
                    displayName,
                    datasourceFieldName,
                    datasourceFieldValue: value,
                    type,
                };
                customFields.push(customField);
            }
        } else {
            const customField = {
                datasourceFieldValue: `${fieldValue}`,
                datasourceFieldName: datasourceFieldName,
                displayName: displayName,
                type: type,
            };
            customFields.push(customField);
        }
        return customFields;
    };
    async translateCustomFields(item: AdoRawItem): Promise<CustomField[]> {
        const { orgId, datasourceId } = item.flomatikaFields;
        const customFieldConfigs = await this.getCustomFieldsConfigs(
            orgId,
            datasourceId,
            item.Project.ProjectId,
        );
        let customFields: Array<CustomField> = [];
        for (const customFieldConfig of customFieldConfigs) {
            const configs: Array<CustomField> = this.translateCustomField(
                item,
                customFieldConfig.datasourceFieldName,
                customFieldConfig.displayName,
                customFieldConfig.type,
            );
            customFields = customFields.concat(configs);
        }
        return customFields;
    }
    translateLinkedItems(item: AdoRawItem): LinkedItem[] {
        return translateAdoLinkedItems(item);
    }
    //Revision item example
    // {
    //     WorkItemId: 7205,
    //     Revision: 2,
    //     Title: 'Test analytic story',
    //     WorkItemType: 'User Story',
    //     ChangedDate: '2021-10-01T18:03:28.513+10:00',
    //     CreatedDate: '2021-09-28T17:06:08.29+10:00',
    //     State: 'Pool of Options',
    //     ClosedDate: null,
    //     StateCategory: 'Proposed',
    //     Project: {
    //       ProjectId: '8223e21c-c9f2-420c-8bc4-a9778c6739f0',
    //       ProjectName: 'main'
    //     }
    //   },
    createSnapshots(
        adoItem: AdoRawItem,
        /**
         * Revisions of this work item
         */
        revisions: any[],
        eventDates: EventDates,
    ) {
        if (!revisions || !revisions.length) return [];
        const snapshots = new Array<AdoSnapshotRawItem>();
        // Sort by work item id, then by Changed Date
        const sortedRevisions = _.chain(revisions as AdoRevisionItem[])
            .filter((revision) => revision.State !== undefined)
            .map(r => ({
                ...r,
                changedDate: DateTime.fromISO(r.ChangedDate).toUTC(),
                changedDateMillis: DateTime.fromISO(r.ChangedDate).toMillis(),
            }))
            .sortBy(['workItemId', 'changedDateMillis'])
            .value();



        //for every revision
        for (let revIdx = 0; revIdx < sortedRevisions.length; revIdx++) {
            let currRevision = sortedRevisions[revIdx];
            let currSnapshotDate = DateTime.fromISO(currRevision.ChangedDate).toUTC();

            const snapshotEventDates = {
                flomatikaArrivalDate: eventDates.arrival ?? currSnapshotDate,
                flomatikaCommitmentDate: eventDates.commitment,
                flomatikaDepartureDate: eventDates.departure,
            };

            //this is pushing the actual revisions
            const isDelayed = isDelayedSnapshot(
                eventDates,
                currRevision.Revision as string,
            );

            const snapshotToPublish = {
                ...currRevision,
                // This is a legacy property
                // We're not using fillers anymore
                createFillersCount: 0,
                flomatikaSnapshotDate: currSnapshotDate
                    .toUTC()
                    .toISO(),
                isFiller: false,
                ...snapshotEventDates,
                isDelayed,
            };

            snapshots.push(snapshotToPublish as any);
        }
        //TODO: do the step 2 filler service here, from last revision date until current date
        //so when we exit this function, ALL gaps between states have been filled, and everything up tp today has been filled
        return snapshots;
    }
    translateSnapshots(
        items: AdoSnapshotRawItem[],
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
        workItemTypeMap: WorkItemTypeMapItem,
        eventDates: EventDates,
    ): StandardSnapshotItem[] {
        const snapshotsToLoad: StandardSnapshotItem[] = [];
        const flomatikaWorkItemTypeId = workItemType.id;
        const workflowId = workflow.workflowId;

        for (const item of items) {
            const eventPointOrders: EventPointOrders = {
                arrivalPointOrder: eventDates.arrivalPointOrder!,
                commitmentPointOrder: eventDates.commitmentPointOrder!,
                departurePointOrder: eventDates.departurePointOrder!,
            };

            let workflowStep, stateOrder, stepCategory;
            if (item.type === RevisionTypes.STATE_CHANGE) {
                workflowStep = workflow.workflowSteps?.find(
                    (step: WorkflowStep) => {
                        return step.id === item.State && step.name === item.State;
                    },
                );

                if (!workflowStep) {
                    this.logger.error({
                        message: 'Workflowstep not found',
                        item,
                        workItemType,
                        workflowId,
                        tags: [LogTags.TRANSFORM]
                    });


                    continue;
                }

                stateOrder = workflowStep.order!;
                stepCategory = calculateStepCategory(stateOrder, eventPointOrders);
            }
            const changedDate = DateTime.fromISO(item.ChangedDate)
                .toUTC();

            const stateCategory = stateCategoryRelativeToDate(
                changedDate,
                item.flomatikaArrivalDate,
                item.flomatikaCommitmentDate,
                item.flomatikaDepartureDate,
            );

            const snapshot: StandardSnapshotItem = {
                flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
                flomatikaWorkItemTypeName: workItemType.displayName!,
                flomatikaWorkItemTypeLevel: workItemType.level!,
                flomatikaSnapshotDate: item.flomatikaSnapshotDate!,
                changedDate: item.ChangedDate,
                workItemId: item.WorkItemId,
                title: item.Title,
                workItemType: item.WorkItemType,
                state: item.State,
                stateCategory,
                stateType: workflowStep?.stateType ?? '',
                stateOrder: stateOrder?.toString() ?? '',
                assignedTo: item.AssignedTo
                    ? item.AssignedTo.UserName
                    : undefined,
                revision: item.Revision,
                isFiller: item.isFiller!,
                flomatikaCreatedBy: 'etl3',
                // This is a legacy property. We dont use fillers anymore
                createFillersCount: 0,
                previousRevision: item.previousRevision,
                projectId: item.Project.ProjectId,
                isDelayed: item.isDelayed,
                stepCategory: stepCategory ?? '',
                resolution: item.Reason,

                type: item.type,
                assignee: item.assignee,
                flagged: item.flagged,
                blockedReason: item.blockedReason,
                discardedReason: item.discardedReason,

                // This field will be overwritten by the load processor.
                // Adding it to fix the typescript's missing property error
                partitionKey: `snapshot#${this.orgId}`,
            };
            snapshotsToLoad.push(snapshot);
        }
        return snapshotsToLoad;
    }
    async translateWorkItem(
        item: AdoRawItem,
        eventDates: EventDates,
        stateCategory: StateCategories,
        workflowStep: WorkflowStep,
    ): Promise<{
        stateItem: StandardStateItem;
        workItemType: WorkItemTypeItem;
        workItemTypeMap: WorkItemTypeMapItem;
    }> {
        const { orgId, datasourceId } = item.flomatikaFields;
        const flomatikaWorkItemTypeId =
            await this.workItemTypeMap.getWorkItemTypeId(
                orgId,
                datasourceId,
                item.WorkItemType,
            );
        const workItemType = await this.workItemTypeMap.getWorkItemType(
            orgId,
            datasourceId,
            flomatikaWorkItemTypeId!,
        );
        const projectId = item.Project.ProjectId;

        if (!workItemType) {
            this.logger.error(({
                message: 'Cannot find work item type for item',
                workItemId: item.WorkItemId,
                projectName: item.Project.ProjectName,
                projectId,
                flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
                datasourceId,
                orgId,
                workItemType: item.WorkItemType,
            }));
            throw Error(
                `Cannot find work item type for item ${JSON.stringify(item)}`,
            );
        }

        const workItemTypeMap = await this.workItemTypeMap.getWorkItemTypeMap(
            orgId,
            datasourceId,
            flomatikaWorkItemTypeId!,
            projectId,
        );

        if (!workItemTypeMap) {
            this.logger.error(({
                message: 'Cannot find work item type map for item',
                workItemId: item.WorkItemId,
                projectName: item.Project.ProjectName,
                projectId: item.Project.ProjectId,
                flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
                datasourceId,
                orgId,
                workItemType: item.WorkItemType,
            }));
            throw Error(
                `Cannot find work item type map for item ${JSON.stringify(item)}`,
            );
        }

        const customFields = await this.translateCustomFields(item);
        const linkedItems = this.translateLinkedItems(item);
        const stateItem: StandardStateItem = {
            flomatikaWorkItemTypeId: flomatikaWorkItemTypeId,
            flomatikaWorkItemTypeName: workItemType.displayName!,
            flomatikaWorkItemTypeLevel: workItemType.level!,

            // SLE from workitem type maps
            // See Jira item for details
            flomatikaWorkItemTypeServiceLevelExpectationInDays:
                workItemTypeMap.serviceLevelExpectationInDays!,

            changedDate: item.ChangedDate,
            workItemId: item.WorkItemId,
            title: item.Title,
            workItemType: item.WorkItemType,
            state: item.State,
            stateCategory,
            stateType: workflowStep.stateType!,
            stateOrder: workflowStep.order!.toString(),
            assignedTo: item.AssignedTo ? item.AssignedTo.UserName : undefined,
            arrivalDate: eventDates.arrival?.toISO(),
            commitmentDate: eventDates.commitment?.toISO(),
            departureDate: eventDates.departure?.toISO(),
            parentId: item.ParentWorkItemId,
            projectId,
            customFields,
            isDelayed: eventDates.isDelayed ?? false,
            linkedItems,
            stepCategory: eventDates.stepCategory!,
            resolution: item.Reason,
            // This field will be overwritten by the load processor.
            // Adding it to fix the typescript's missing property error
            partitionKey: `state#${this.orgId}`
        };
        return { stateItem, workItemType, workItemTypeMap };
    }
    async createAndLoadSnapshot(
        adoItem: AdoRawItem,
        histories: any[],
        eventDates: EventDates,
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
        workItemTypeMap: WorkItemTypeMapItem,
    ): Promise<void> {
        const rawSnapshots = this.createSnapshots(
            adoItem,
            histories,
            eventDates,
        );
        const translatedSnapshots = this.translateSnapshots(
            rawSnapshots,
            workflow,
            workItemType,
            workItemTypeMap,
            eventDates,
        );
        const transformedSnapshots = processFlaggedRevisions(translatedSnapshots);
        for (const snapshot of transformedSnapshots) {
            await this.notifySnapshotItemLoader(
                this.orgId,
                this.datasourceId,
                snapshot,
            );
        }
    }
    async notifyStateItemLoader(
        orgId: string,
        datasourceId: string,
        stateItem: StandardStateItem,
    ): Promise<string> {
        changeUndefinedToNull(stateItem);

        this.logger.info(({
            message: 'Sending item to state loader',
            workItemId: stateItem.workItemId,
            orgId,
            datasourceId,
            tags: [LogTags.TRANSFORM]
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
            message: 'Sending snapshot item to loader',
            workItemId: snapshotItem.workItemId,
            revision: snapshotItem.revision,
            orgId,
            datasourceId,
            tags: [LogTags.TRANSFORM]
        }));
        return await this.snapshotLoadNotifier.notify(
            orgId,
            datasourceId,
            snapshotItem,
        );
    }
}
