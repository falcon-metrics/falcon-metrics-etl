import { EventDates, HistoryItem } from '../configuration/event_date_extractor';
import { ServiceDetails } from '../data/datasource_aurora';
import {
    Workflow,
    WorkflowStep,
    WorkItemTypeItem,
    WorkItemTypeMapItem,
} from '../data/work_item_type_aurora';
import { StateCategories } from '../utils/date_utils';
import {
    CustomField,
    LinkedItem,
    StandardSnapshotItem,
    StandardStateItem,
} from '../workitem/interfaces';

export interface RawItem {
    flomatikaFields: {
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        workItemId: string;
        extractTime: string;
        excludeBeforeDate: string | undefined;
    };
}
export type ChangeLogHistory = {
    id: string;
    historyId: string;
    created: string;
    items: Array<{
        field: string;
        to: string;
        toString: string;
        fromString: string;
        from: string;
        fieldId: string;
    }>;
};

export type ItemStatus = { statusId: string; statusName: string };

export interface IRevisionProcessor {
    getWorkItemFromS3(s3Key: string): Promise<RawItem>;
    processS3Object(s3Key: string): Promise<string>;
    processRevisions(workItem: RawItem): Promise<string>;
    getRevisions(item: RawItem, histories: any[]): HistoryItem[];
    identifyWorkflow(item: RawItem): Promise<Workflow | undefined>;
    identifyWorkflowStep(
        item: RawItem,
        workflow: Workflow,
    ): Promise<WorkflowStep>;
    getUnmappedWorkflowSteps(
        item: ItemStatus,
        histories: HistoryItem[],
        workflow: Workflow,
    ): WorkflowStep[];
    getEventDates(
        histories: HistoryItem[],
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): Promise<EventDates>;
    getStateCategory(eventDates: EventDates): StateCategories;
    createSnapshots(
        item: RawItem,
        histories: HistoryItem[],
        eventDates: EventDates,
    ): RawItem[] | HistoryItem[];
    translateSnapshots(
        item: RawItem[] | HistoryItem[],
        workflow: Workflow,
        workItemType: WorkItemTypeItem,
        workItemTypeMap: WorkItemTypeMapItem,
        eventDates: EventDates,
    ): StandardSnapshotItem[];
    translateWorkItem(
        item: RawItem,
        eventDates: EventDates,
        stateCategory: StateCategories,
        workflowStep: WorkflowStep,
    ): Promise<{
        stateItem: StandardStateItem;
        workItemType: WorkItemTypeItem;
        workItemTypeMap: WorkItemTypeMapItem;
    }>;
    translateCustomFields(item: RawItem): Promise<CustomField[]>;
    translateLinkedItems(parentItem: RawItem): LinkedItem[];
    notifyStateItemLoader(
        orgId: string,
        datasourceId: string,
        stateItem: StandardStateItem,
    ): Promise<string>;
    notifySnapshotItemLoader(
        orgId: string,
        datasourceId: string,
        snapshotItem: StandardSnapshotItem,
    ): Promise<string>;
}
