export type StandardStateItem = {
    flomatikaWorkItemTypeId: string;
    flomatikaWorkItemTypeName: string;
    flomatikaWorkItemTypeLevel: string;
    flomatikaWorkItemTypeServiceLevelExpectationInDays: number;

    workItemId: string;
    title: string;
    workItemType: string;
    state: string;
    stateCategory: string;
    stateType: string;
    stateOrder: string;
    contextId?: string;
    classOfService: string;
    classOfServiceId?: string;
    natureOfWork: string;
    valueArea: string;
    assignedTo: string;

    triage: string;

    arrivalDate: string;
    commitmentDate?: string;
    departureDate?: string;
    projectId?: string;
    changedDate: string;

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
