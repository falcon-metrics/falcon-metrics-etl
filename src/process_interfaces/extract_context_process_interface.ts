export interface IExtractContextProcessor {
    extractContextWorkItemMaps(contextId: string): Promise<void>;
}

export const CONTEXT_WORKITEM_MAPPING_QUEUE = 'ContextWorkItemMappingQueue';
