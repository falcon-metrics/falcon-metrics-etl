import { CustomField, StandardSnapshotItem, StandardStateItem } from "../../workitem/interfaces";
import { LoremIpsum } from "lorem-ipsum";

const LOREM = new LoremIpsum({
    wordsPerSentence: {
        max: 8,
        min: 2
    }
});

const ASSIGNEES: Map<string, string> = new Map([
    ['Alice', 'David Coulthard'],
    ['Bob', 'Narain Karthikeyan'],
    ['Carl', 'Alain Prost'],
]);

const WHITELIST_CUSTOMFIELDS: Array<string> = [
    "priority",
    "customfield_10029",//class of service
    "customfield_10034",//value area
    "fixVersions",
    "customfield_10097",// Blocked reason
    "duedate",// Due Date
];

const generateTitle = (): string => {
    return LOREM.generateSentences(1);
};

const replaceAssignee = (original?: string | null): string => {

    if (original && ASSIGNEES.has(original)) {
        return ASSIGNEES.get(original)!;
    } else {
        return 'assignee';
    }
};

// const replaceReporter = (original: string): string => {
//     return 'reporter';
// }

const replaceWorkItemTypeId = (originalWorkItemTypeId: string): string => {
    return originalWorkItemTypeId.replace('flomatika', 'flomatika-demo');
};

const whitelistCustomFields = (customFields: CustomField[] | undefined | null): CustomField[] | undefined => {
    if (customFields) {
        return customFields.filter(cf => WHITELIST_CUSTOMFIELDS.includes(cf.datasourceFieldName));
    } else {
        return;
    }
};

/*
    sanitises the data by replacing identifiable
    data with know substitues so that it's consistent
*/

export const translateDemoData_State = (
    item: StandardStateItem
): StandardStateItem => {

    item.assignedTo = replaceAssignee(item.assignedTo);
    item.title = generateTitle();
    item.customFields = whitelistCustomFields(item.customFields);
    item.flomatikaWorkItemTypeId = replaceWorkItemTypeId(item.flomatikaWorkItemTypeId);

    return item;
};


export const translateDemoData_Snapshot = (
    item: StandardSnapshotItem
): StandardSnapshotItem => {

    item.assignedTo = replaceAssignee(item.assignedTo);
    //item.title = //comes from the state item for consistency
    item.customFields = whitelistCustomFields(item.customFields);
    item.flomatikaWorkItemTypeId = replaceWorkItemTypeId(item.flomatikaWorkItemTypeId);

    return item;
};