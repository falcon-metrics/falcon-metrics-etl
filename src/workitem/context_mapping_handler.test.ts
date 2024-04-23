import { isValid } from './context_mapping_handler';

describe('isValid', () => {
    it('TODO: ENABLE THIS TEST. THIS TEST IS DISABLED - should return true for valid payload', () => {
        const validPayload = {
            orgId: '123',
            contextId: '456',
            datasourceId: '789',
            extractRunAt: '2023-10-27T14:30:00.000Z', // Date as a string
            workItemIdKey: 'orgId--datasourceId--contextId.json',
        };
        const result = isValid(validPayload);
        expect(result).toBe(true);
        // expect(true).toBe(true);
    });

    it('TODO: ENABLE THIS TEST. THIS TEST IS DISABLED - should return false for missing orgId', () => {
        const invalidPayload = {
            contextId: '456',
            datasourceId: '789',
            extractRunAt: '2023-10-27T14:30:00.000Z', // Date as a string
            workItemIdKey: 'orgId--datasourceId--contextId.json',
        };
        const result = isValid(invalidPayload);
        expect(result).toBe(false);
        // expect(true).toBe(false);
    });
});
