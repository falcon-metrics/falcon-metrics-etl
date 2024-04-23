import { Sequelize } from 'sequelize';
import { Logger } from 'pino';
import { CustomFieldItem } from './interfaces';
import { CustomFieldModel } from '../data/models/CustomFieldModel';
import { StateModel } from '../data/models/StateModel';

export class CustomFieldLoadProcessor {
    private logger: Logger;
    private database: Promise<Sequelize>;

    constructor(opt: { logger: Logger; database: Promise<Sequelize> }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async process(
        orgId: string,
        datasourceId: string,
        customFields: Array<CustomFieldItem>,
    ): Promise<void> {
        await this.addOrUpdate(orgId, datasourceId, customFields);
    }

    private async addOrUpdate(
        orgId: string,
        datasourceId: string,
        customFields: Array<CustomFieldItem>,
    ): Promise<void> {
        if (!orgId || orgId === '') return undefined;
        if (!datasourceId || datasourceId === '') return undefined;
        if (!customFields || customFields.length === 0) return undefined;

        customFields = [...new Set(customFields)];

        const uniqueCustomFields: Map<string, CustomFieldItem> = new Map();

        for (const customField of customFields) {
            const key = `${customField.orgId}#${customField.datasourceId}#${customField.datasourceFieldName}#${customField.datasourceFieldValue}#${customField.workItemId}`;

            if (!uniqueCustomFields.has(key)) {
                uniqueCustomFields.set(key, customField);
            }
        }

        customFields = [...uniqueCustomFields.values()];

        try {
            const aurora = await this.database;

            const inlineCustomFields = [];
            const customFieldModel = CustomFieldModel(aurora, Sequelize);
            for (const customField of customFields) {
                await customFieldModel.upsert(customField);

                this.logger.info(
                    `saved custom field. orgId: ${orgId}, displayName: ${customField.displayName}`,
                );

                inlineCustomFields.push({
                    name: customField.datasourceFieldName,
                    type: customField.type,
                    value: customField.datasourceFieldValue,
                    displayName: customField.displayName,
                });
            }

            if (inlineCustomFields.length > 0) {
                const stateModel = StateModel(aurora, Sequelize);

                const where = {
                    partitionKey: `state#${orgId}`,
                    sortKey: `${datasourceId}#${customFields[0].workItemId}`,
                };

                await stateModel.update(
                    {
                        customFields: inlineCustomFields,
                    },
                    {
                        where,
                    },
                );
            }
        } catch (err) {
            this.logger.error(
                `[CUSTOMFIELD: ${orgId}] [AURORA] Failed loading notification. %o`,
                err,
            );
        }
    }
}
