import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { QueryTypes, Sequelize } from 'sequelize';
import { CustomFieldModel } from '../data/models/CustomFieldModel';
import { StateModel } from '../data/models/StateModel';
import { StandardStateItem } from './interfaces';

export class StateLoadProcessorAurora {
    private logger: Logger;
    private database: Promise<Sequelize>;

    constructor(opt: { logger: Logger; database: Promise<Sequelize> }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async process(
        orgId: string,
        datasourceId: string,
        item: StandardStateItem,
    ): Promise<void> {
        await this.addOrUpdate(orgId, datasourceId, item);
    }

    private async addOrUpdate(
        orgId: string,
        datasourceId: string,
        item: StandardStateItem,
    ): Promise<void> {
        this.logger.info({
            message: 'Load state params',
            orgId,
            datasourceId,
            item,
        });
        if (!orgId || orgId === '') return undefined;
        if (!datasourceId || datasourceId === '') return undefined;
        const aurora = await this.database;
        const transaction = await aurora.transaction();

        try {
            const stateModel = StateModel(aurora, Sequelize);

            const customFields = item.customFields;
            delete item.customFields;

            const state = {
                ...item,
                partitionKey: `state#${orgId}`,
                sortKey: `${datasourceId}#${item.workItemId}`,
                flomatikaCreatedDate: DateTime.utc().toISO(),
                deletedAt: null,
            };

            let inlineCustomFields = [];

            const uniqueCustomFields: Map<string, any> = new Map();

            if (customFields) {
                const customFieldModel = CustomFieldModel(aurora, Sequelize);

                const query = `
                    delete 
                        from "customFields"
                    where 
                        "orgId" = :orgId
                        and "datasourceId" = :datasourceId
                        and "workItemId" = :workItemId
                `;
                await aurora.query(query, {
                    transaction,
                    type: QueryTypes.DELETE,
                    replacements: {
                        orgId,
                        datasourceId,
                        workItemId: state.workItemId.toString(),
                    },
                });
                for (const customField of customFields) {
                    const cfDb = {
                        ...customField,
                        orgId,
                        datasourceId,
                        workItemId: state.workItemId,
                    };
                    await customFieldModel.upsert(cfDb, { transaction });

                    this.logger.info({
                        message: 'Saved custom field',
                        ...customField,
                    });

                    const key = `${customField.datasourceFieldName}#${customField.datasourceFieldValue}`;
                    if (!uniqueCustomFields.has(key)) {
                        uniqueCustomFields.set(key, {
                            name: customField.datasourceFieldName,
                            type: customField.type,
                            value: customField.datasourceFieldValue,
                            displayName: customField.displayName,
                        });
                    }
                }

                inlineCustomFields = [...uniqueCustomFields.values()];

                if (inlineCustomFields.length > 0) {
                    state.customFields = inlineCustomFields;
                }
            }

            await stateModel.upsert(state);

            await transaction.commit();

            this.logger.info({
                message: 'Saved state item',
                workItemId: item.workItemId,
            });
        } catch (err) {
            await transaction.rollback();
            this.logger.error({
                message: 'Error when saving state item',
                item,
                errorMessage: err.message,
                errorStack: err.stack,
            });
            throw err;
        }
    }
}
