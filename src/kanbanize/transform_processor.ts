import _ from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import slugify from 'slugify';
import {
    calculateStepCategory,
    EventPointOrders,
} from '../common/process_revision_utils';
import { Config, ConfigFactory } from '../configuration/config';
import {
    EventDates,
    HistoryItem,
    IEventDateExtractor,
} from '../configuration/event_date_extractor';
import {
    Workflow,
    WorkflowStep,
    WorkItemType,
    WorkItemTypeItem,
    WorkItemTypeMapItem,
} from '../data/work_item_type_aurora';
import { RevisionTypes } from '../jiracloud/process/revision_processor';
import { ILoadNeededNotifier } from '../notifications/load_needed_notifier';
import {
    StateCategories,
    stateCategoryByDate,
    stateCategoryRelativeToDate,
} from '../utils/date_utils';
import { LogTags } from '../utils/log_tags';
import {
    CustomField,
    StandardSnapshotItem,
    StandardStateItem,
} from '../workitem/interfaces';
import { Card, CardRawItem } from './extract_state_processor';
import { changeUndefinedToNull } from '../utils/object_utils';

/**
 * In kanbanize, the work item type is not associated to a workflow.
 * The card type is a property on a card.
 * Therefore, the workflow id is omitted here. In the database,
 * workflowId is set as 'NOT APPLICABLE'
 */
type KanbanizeWorkItemTypeMapItem = Omit<WorkItemTypeMapItem, 'workflowId'>;

export class KanbanizeTransformProcessor {
    private readonly configFactory: ConfigFactory;
    private _config?: Config;
    private logger: Logger;
    private eventDateExtractor: IEventDateExtractor;
    private stateLoadNotifier: ILoadNeededNotifier;
    private snapshotLoadNotifier: ILoadNeededNotifier;

    constructor(opts: {
        configFactory: ConfigFactory;
        logger: Logger;
        eventDateExtractor: IEventDateExtractor;
        stateLoadNotifier: ILoadNeededNotifier;
        snapshotLoadNotifier: ILoadNeededNotifier;
    }) {
        this.configFactory = opts.configFactory;
        this.logger = opts.logger;
        this.eventDateExtractor = opts.eventDateExtractor;
        this.stateLoadNotifier = opts.stateLoadNotifier;
        this.snapshotLoadNotifier = opts.snapshotLoadNotifier;
        this.logger = opts.logger;
    }

    get config(): Config {
        if (!this._config) {
            throw new Error('config not initailized');
        }
        return this._config;
    }

    get orgId(): string {
        return this.config.orgId;
    }

    private get workItemTypeMaps() {
        return this.config.workItemTypeMaps as KanbanizeWorkItemTypeMapItem[];
    }

    async initConfig() {
        this._config = await this.configFactory.create();
        this.logger = this.logger.child({
            orgId: this.orgId,
            datasourceId: this.config.datasourceId,
            tags: [LogTags.TRANSFORM],
        });
    }

    identifyWorkflow(card: CardRawItem): Workflow {
        const orgId = this.orgId;
        const workflowId = slugify(
            `${orgId}.${card.board_id}.${card.workflow_name}`,
        ).toLowerCase();

        const workflow = this.config.workflows.find(
            (w) => w.workflowId === workflowId,
        );

        if (!workflow) {
            this.logger.error({
                message: 'Cannot find workflow for item',
                workItemId: card.flomatikaFields.workItemId,
                projectName: card.board_name,
                projectId: card.board_id,
                workflowId,
                datasourceId: this.config.datasource.datasourceId,
                orgId: orgId,
            });
            throw new Error('Cannot find workflow for item');
        }
        return workflow;
    }

    // This can be in config.
    // The comparator function can be accepted as a parameter
    identifyWorkflowStep(card: Card, workflow: Workflow): WorkflowStep {
        const test = workflow.workflowSteps?.filter((wfs) => {
            return (
                wfs.id?.toString() === card.column_id.toString() &&
                wfs.name === card.column_name
            );
        });
        const workflowStep = (workflow.workflowSteps ?? []).find(
            (wfs) =>
                wfs.id?.toString() === card.column_id.toString() &&
                wfs.name === card.column_name,
        );

        if (!workflowStep) {
            this.logger.error({
                message: 'Cannot find workflow step for item',
                workItemId: card.card_id,
                projectName: card.board_name,
                projectId: card.board_id,
                workflowId: workflow.workflowId,
                workflowName: workflow.name,
                datasourceId: this.config.datasource.datasourceId,
                orgId: this.orgId,
            });
            throw Error(
                `Cannot find workflow step for item ${JSON.stringify(card)}`,
            );
        }
        return workflowStep;
    }

    private async transformCard(
        card: CardRawItem,
        eventDates: EventDates,
        stateCategory: StateCategories,
        workflowStep: WorkflowStep,
    ): Promise<{
        item: StandardStateItem;
        workItemType: WorkItemTypeItem;
    }> {
        const witm = this.findWorkItemTypeMap(card);
        if (!witm) {
            throw new Error('Work item type map not found');
        }
        const wit = this.config.workItemTypes.find(
            (wit) => wit.id === witm.workItemTypeId,
        );

        if (!wit) {
            throw new Error('Work item type not found');
        }

        const flomatikaWorkItemTypeId = witm.workItemTypeId!;

        const stateItem: StandardStateItem = {
            partitionKey: `state#${this.config.orgId}`,
            assignedTo: card.owner_user_name,
            changedDate: card.last_modified,
            stateCategory,

            flomatikaWorkItemTypeId,
            flomatikaWorkItemTypeName: wit.displayName!,
            flomatikaWorkItemTypeLevel: wit.level!,

            // SLE from workitem type maps
            flomatikaWorkItemTypeServiceLevelExpectationInDays:
                witm.serviceLevelExpectationInDays!,

            workItemId: card.card_id.toString(),
            title: card.title,
            workItemType: card.type_name ?? 'Card',
            state: card.column_name,
            stateType: workflowStep.stateType!,
            stateOrder: workflowStep.order!.toString(),
            arrivalDate: eventDates.arrival?.toISO(),
            commitmentDate: eventDates.commitment?.toISO(),
            departureDate: eventDates.departure?.toISO(),
            projectId: card.board_id.toString(),
            isDelayed: eventDates.isDelayed ?? false,
            stepCategory: eventDates.stepCategory!,
            customFields: this.transformCustomFields(card),
        };

        return {
            item: stateItem,
            workItemType: wit,
        };
    }

    private transformTransitions(
        item: StandardStateItem,
        card: Card,
        eventDates: EventDates,
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
    ): StandardSnapshotItem[] {
        const transitions = this.getStateTransitions(card.transitions);
        const revisions: StandardSnapshotItem[] = [];

        transitions.forEach((t) => {
            const workflowStep = (workflow.workflowSteps ?? []).find(
                (wfs) =>
                    wfs.id === t.column_id.toString() &&
                    wfs.name === t.column_name,
            );
            if (!workflowStep) {
                this.logger.error({
                    message: 'Cannot find work flow step for item',
                    workItemId: item.workItemId,
                    projectName: card.board_name,
                    projectId: card.board_id,
                    workflowId: workflow.workflowId,
                    datasourceId: this.config.datasource.datasourceId,
                    orgId: this.orgId,
                });
                throw new Error(
                    `Cannot find work flow step for item ${item.workItemId}`,
                );
            }
            const changedDate = DateTime.fromISO(t.start);

            const stateOrder = workflowStep.order!;
            const stateType = workflowStep.stateType!;
            const eventPointOrders: EventPointOrders = {
                arrivalPointOrder: eventDates.arrivalPointOrder!,
                commitmentPointOrder: eventDates.commitmentPointOrder!,
                departurePointOrder: eventDates.departurePointOrder!,
            };
            const stepCategory = calculateStepCategory(
                stateOrder,
                eventPointOrders,
            );
            const stateCategory = stateCategoryRelativeToDate(
                changedDate,
                item.arrivalDate
                    ? DateTime.fromISO(item.arrivalDate)
                    : undefined,
                item.commitmentDate
                    ? DateTime.fromISO(item.commitmentDate)
                    : undefined,
                item.departureDate
                    ? DateTime.fromISO(item.departureDate)
                    : undefined,
            );

            revisions.push({
                partitionKey: this.orgId,
                revision: t.revision,
                workItemId: item.workItemId,
                type: RevisionTypes.STATE_CHANGE,
                flomatikaWorkItemTypeId: workItemType.id,
                flomatikaWorkItemTypeName: workItemType.displayName!,
                flomatikaWorkItemTypeLevel: workItemType.level!,
                flomatikaSnapshotDate: changedDate.toString(),
                changedDate: changedDate.toISO()!,
                title: item.title,
                workItemType: item.workItemType,
                stateCategory,
                stateType,
                stepCategory,
                state: t.column_name,
                stateOrder: stateOrder.toString(),
                flomatikaCreatedBy: 'etl3',
                assignedTo: undefined,
                isFiller: false,
            });
        });
        return revisions;
    }

    /**
     * Keep only the column_id changes
     */
    private getStateTransitions(transitions: Card['transitions']) {
        return transitions.reduce(
            (accum, current, i) => {
                if (accum.length > 0) {
                    const previous = _.last(accum);
                    // Skip if the current column_id is same as the previous column_id
                    if (
                        previous !== undefined &&
                        current.column_id !== previous.column_id
                    ) {
                        accum.push({ ...current, revision: i });
                    }
                } else {
                    accum.push({ ...current, revision: i });
                }
                return accum;
            },
            [] as (Card['transitions'][0] & { revision: number })[],
        );
    }

    private getHistoryItems(card: Card): HistoryItem[] {
        const historyItems: HistoryItem[] = [];
        const transitions = this.getStateTransitions(card.transitions);
        transitions.forEach((t) => {
            historyItems.push({
                changedDate: DateTime.fromISO(t.start),
                statusId: t.column_id.toString(),
                statusName: t.column_name,
                type: RevisionTypes.STATE_CHANGE,
            });
        });
        return historyItems;
    }

    async notifySnapshotItemLoader(
        orgId: string,
        datasourceId: string,
        snapshotItem: StandardSnapshotItem,
    ): Promise<string> {
        changeUndefinedToNull(snapshotItem);

        this.logger.info({
            message: 'Sending item to snapshot loader',
            workItemId: snapshotItem.workItemId,
            revision: snapshotItem.revision,
            orgId,
            datasourceId,
            tags: [LogTags.EXTRACT],
        });
        return await this.snapshotLoadNotifier.notify(
            orgId,
            datasourceId,
            snapshotItem,
        );
    }

    async notifyStateItemLoader(
        orgId: string,
        datasourceId: string,
        stateItem: StandardStateItem,
    ): Promise<string> {
        changeUndefinedToNull(stateItem);

        this.logger.info({
            message: 'Notifying state loader',
            workItemId: stateItem.workItemId,
            projectName: this.config.projects.find(
                (p) => stateItem.projectId === p.projectId,
            )?.name,
            projectId: stateItem.projectId,
            datasourceId: this.config.datasource.datasourceId,
            orgId: this.orgId,
            tags: [LogTags.TRANSFORM],
        });
        return await this.stateLoadNotifier.notify(
            orgId,
            datasourceId,
            stateItem,
        );
    }

    findWorkItemTypeMap(card: Card): WorkItemTypeMapItem | undefined {
        const witm = this.workItemTypeMaps.find(
            (witm) =>
                witm.datasourceWorkItemId ===
                    (card.type_id?.toString() ?? '0') &&
                witm.projectId.toString() === card.board_id.toString(),
        );
        return witm;
    }

    isConfiguredCardType(card: Card): boolean {
        const witm = this.findWorkItemTypeMap(card);
        if (!witm) {
            this.logger.warn({
                message: 'Work item type map not found. Skipping item',
                workItemId: card.card_id,
                projectName: card.board_name,
                projectId: card.board_id,
                datasourceId: this.config.datasource.datasourceId,
                datasourceType: this.config.datasourceType,
                orgId: this.orgId,
            });
            return false;
        }
        return true;
    }

    async transform(card: CardRawItem) {
        await this.initConfig();
        this.logger.info({
            message: `Starting transform for the card ${card.card_id}`,
            workItemId: card.card_id,
            projectName: card.board_name,
            projectId: card.board_id,
            datasourceId: this.config.datasource.datasourceId,
            orgId: this.orgId,
            tags: [LogTags.TRANSFORM],
        });

        let workflow = this.identifyWorkflow(card);

        const unmappedWorkflowSteps = this.config.getUnmappedWorkflowSteps(
            {
                statusId: card.column_id.toString(),
                statusName: card.column_name,
            },
            card.transitions.map((t, index) => ({
                changedDate: DateTime.fromISO(t.start),
                statusId: t.column_id.toString(), //workflow step id
                statusName: t.column_name,
                type: RevisionTypes.STATE_CHANGE,
            })),
            workflow,
        );

        if (unmappedWorkflowSteps.length > 0) {
            this.logger.info({
                message: 'Saving unmapped workflow steps',
                workItemId: card.card_id,
                projectName: card.board_name,
                projectId: card.board_id,
                datasourceId: this.config.datasource.datasourceId,
                orgId: this.orgId,
                tags: [LogTags.TRANSFORM, LogTags.UNMAPPED_WORKFLOW_STEPS],
                unmappedWorkflowSteps,
            });
            for (const unmappedStep of unmappedWorkflowSteps) {
                await this.config.mapWorkflowStep(workflow, unmappedStep);
            }
        }

        workflow = this.identifyWorkflow(card);
        const workflowStep = this.identifyWorkflowStep(card, workflow);

        const historyItems = this.getHistoryItems(card);
        const eventDates = this.eventDateExtractor.getEventDatesFromHistory(
            historyItems,
            workflow,
            workflowStep,
        );
        const stateCategory = stateCategoryByDate(
            eventDates.arrival?.toISO() ?? undefined,
            eventDates.commitment?.toISO() ?? undefined,
            eventDates.departure?.toISO() ?? undefined,
        );

        // If the card type is not configured in the wizard, skip this card
        if (!this.isConfiguredCardType(card)) {
            return;
        }
        const { item, workItemType } = await this.transformCard(
            card,
            eventDates,
            stateCategory,
            workflowStep,
        );
        const snapshots = this.transformTransitions(
            item,
            card,
            eventDates,
            workflow,
            workItemType,
        );

        await this.notifyStateItemLoader(
            this.orgId,
            this.config.datasource.datasourceId,
            item,
        );
        await Promise.all(
            snapshots.map((snapshot) =>
                this.notifySnapshotItemLoader(
                    this.orgId,
                    this.config.datasource.datasourceId,
                    snapshot,
                ),
            ),
        );
    }

    transformCustomFields(card: Card): CustomField[] | undefined {
        const customFields = card.custom_fields ?? [];
        const transformedCustomFields: CustomField[] = [];
        customFields
            .filter((cf) => cf.display_value !== undefined)
            .forEach((cf) => {
                transformedCustomFields.push({
                    datasourceFieldName: cf.field_id.toString(),
                    datasourceFieldValue: cf.display_value!,
                    displayName: cf.field_name,
                    type: 'string',
                });
            });

        if (transformedCustomFields.length === 0) return undefined;
        return transformedCustomFields;
    }
}
