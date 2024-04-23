import { DateTime } from 'luxon';

// Flomatika Sprint Type
export type FlomatikaSprint = {
    orgId: string;
    datasourceId: string;
    sprintId: string;
    name: string;
    startDate?: DateTime;
    endDate?: DateTime;
    flomatikaCreatedDate: DateTime;
};

// Sprint-Work Item map base type
export type SprintWorkItemMapBase = {
    orgId: string;
    datasourceId: string;
    sprintId: string;
    workItemId: string;
};
export type SprintWorkItemMap = SprintWorkItemMapBase & {
    createdAt: DateTime;
    updatedAt: DateTime;
    deletedAt: DateTime;
};

export type SprintMetadataBase = {
    datasourceType: string;
};

export const SPRINT_WORKITEM_MAPPING_QUEUE = 'SprintMappingQueue';

export interface ISprintProcessor {
    /**
     * Method to do ETL.
     * This method performs all three steps of ETL and
     * queues the sprints for sprint-workitems mapping
     */
    process(): Promise<void>;
    mapSprintsToWorkItems(
        sprint: FlomatikaSprint,
        metadata?: any,
    ): Promise<void>;
}
