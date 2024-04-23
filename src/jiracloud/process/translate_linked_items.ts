import { LinkedItem } from "../../workitem/interfaces";

export const translateJiraLinkedItems = (
    parentWorkItem: any
): Array<LinkedItem> => {
    const linkedIssues = parentWorkItem.fields.issuelinks;

    if (!linkedIssues || !linkedIssues.length) {
        return [];
    }

    const translatedLinkedItems: Array<LinkedItem> = [];

    for (const link of linkedIssues) {
        const { type } = link;

        let jiraLinkType, workItemId;

        if (link.outwardIssue) {
            const { outwardIssue } = link;

            jiraLinkType = type.outward;
            workItemId = outwardIssue.key;

        } else if (link.inwardIssue) {
            const { inwardIssue } = link;

            jiraLinkType = type.inward;
            workItemId = inwardIssue.key;

        } else {
            continue;
        }

        translatedLinkedItems.push({
            type: jiraLinkType,
            workItemId,
        });
    }

    return translatedLinkedItems;
};