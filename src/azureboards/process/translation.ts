import { FlomatikaItemLinkType, LinkedItem } from '../../workitem/interfaces';
import { AdoRawItem } from './revision_processor';


export interface RawAdoItemLink {
    LinkTypeName: string;
    TargetWorkItemId: string;
}

export const translateAdoLinkedItems = (
    parentWorkItem: AdoRawItem,
): Array<LinkedItem> => {
    const linkedWorkItems = parentWorkItem.Links;

    if (!linkedWorkItems || !linkedWorkItems.length) {
        return [];
    }
    const translatedLinkedItems: Array<LinkedItem> = [];
    for (const link of linkedWorkItems) {
        const { LinkTypeName, TargetWorkItemId } = link;
        translatedLinkedItems.push({
            type: LinkTypeName,
            workItemId: TargetWorkItemId,
        });
    }
    return translatedLinkedItems;
};
