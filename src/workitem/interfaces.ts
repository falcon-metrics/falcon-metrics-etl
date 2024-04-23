import { RevisionTypes } from '../jiracloud/process/revision_processor';

export enum FlomatikaItemLinkType {
    RELATES = 'relates',

    BLOCKS = 'blocks',
    BLOCKED_BY = 'blockedby',
    PARENT = 'parent',
}

export type LinkedItem = {
    type: string;
    workItemId: string;
};

export type CustomField = {
    /**
     * ID of the custom field in the datasource
     */
    datasourceFieldName: string;
    datasourceFieldValue: string | number | boolean;
    displayName: string;
    type: string;
};

export type CustomFieldItem = CustomField & {
    orgId: string;
    datasourceId: string;
    workItemId: string;
};

type CommonItem = {
    partitionKey: string;

    flomatikaWorkItemTypeId: string;
    flomatikaWorkItemTypeName: string;
    flomatikaWorkItemTypeLevel: string;

    workItemId: string;
    title: string | null | undefined;
    workItemType: string;
    state: string;
    stateCategory: string;
    stateType: string;
    stateOrder: string;

    assignedTo: string | null | undefined;

    customFields?: Array<CustomField> | null;
    parentId?: string | null;

    stepCategory: string;

    resolution?: string | null;
};

export type StandardStateItem = CommonItem & {
    flomatikaWorkItemTypeServiceLevelExpectationInDays: number;

    changedDate: string;

    arrivalDate?: string | null;
    commitmentDate?: string | null;
    departureDate?: string | null;

    classOfServiceId?: string | null;
    natureOfWorkId?: string | null;
    valueAreaId?: string | null;
    projectId?: string | null;

    linkedItems?: Array<LinkedItem> | null;

    isDelayed?: boolean | null;

    /**
     * Items are flagged in Jira to mark them as blocked.
     * When an item is flagged in Jira, flagged is true
     *
     * https://example.atlassian.net/browse/FLO-2853
     */
    flagged?: boolean | null;
};

export type ExtendedStandardStateItem = StandardStateItem & {
    classOfServiceId?: string;

    triage: string;

    prioritisationCODUrgency?: string;
    prioritisationCODValue?: string;
    prioritisationEisenhower?: string;
    prioritisationMoscow?: string;
    prioritisationLifecycle?: string;
    prioritisationKanoDysfunctionalForm?: string;
    prioritisationKanoFunctionalForm?: string;
    prioritisationKanoImportance?: string;
    prioritisationRICEConfidence?: string;
    prioritisationRICEEffort?: string;
    prioritisationRICEReach?: string;
    prioritisationRICEImpact?: string;
};

export type StandardSnapshotItem = CommonItem & {
    flomatikaSnapshotDate: string;
    flomatikaCreatedBy: string;
    changedDate: string;
    revision: number;
    isFiller: boolean;
    createFillersCount?: number | null;
    previousRevision?: number | null;

    classOfServiceId?: string | null;
    natureOfWorkId?: string | null;
    valueAreaId?: string | null;
    projectId?: string | null;
    isDelayed?: boolean | null;

    // Mandatory field. Identified the type of revision
    type: RevisionTypes;
    /**
     * This field is used only in the revisions of type ASSIGNEE_CHANGE.
     * This field is use to record different assignees (owners)
     * of the work item over the course of the life time of the
     * work item
     */
    assignee?: string | null;
    /**
     * This field is used only in the revisions of type BLOCKED_REASON.
     * Used to record the all the reasons why an item was blocked during
     * its life time. Inorder to ingest this field, the id of the custom field
     * that has the blocked reason must be configured in settings
     */
    blockedReason?: string | null;
    /**
     * This field is used only in the revisions of type DISCARDED_REASON.
     * Similar to `blockedReason`, this is used to record the reason for discarding an item
     * Inorder to ingest this field, the id of the custom field
     * that has the discarded reason must be configured in settings
     */
    discardedReason?: string | null;
    /**
     * This field is used only in the revisions of type FLAGGED
     */
    flagged?: boolean | null;
};
