import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { Sequelize, QueryTypes } from 'sequelize';
import { ContextWorkItemMapModel } from './ContextWorkItemMapModel';
import _ from 'lodash';
import { LogTags } from '../utils/log_tags';
import { IS3Client } from './s3_client';

export class ContextWorkitemMapProcessorAurora {
    private logger: Logger;
    private database: Promise<Sequelize>;
    private itemUploader: IS3Client;

    constructor(opt: {
        logger: Logger;
        database: Promise<Sequelize>;
        itemUploader: IS3Client;
    }) {
        this.logger = opt.logger;
        this.database = opt.database;
        this.itemUploader = opt.itemUploader;
    }

    /**
     * @deprecated
     *
     * This was used when the delete was done asynchronously. That caused
     * issues. Thats why this method has been deprecated.
     *
     * Delete is being done in the `updateCwims` method
     */
    async processDelete(
        orgId: string,
        datasourceId: string,
        extractRunAt: DateTime,
    ): Promise<void> {
        if (!orgId || orgId === '') return undefined;
        if (!datasourceId || datasourceId === '') return undefined;
        if (!extractRunAt || extractRunAt.invalidReason) return undefined;

        const database = await this.database;
        try {
            //sometimes work items move context in the datasource,
            //but ETL can't "see" that, but we know if it didn't
            //get extracted last time then it can be deleted.
            //that's what we're doing here

            const query = `  
                delete
                from
                    "contextWorkItemMaps" cwim
                        using "contexts" c
                where
                    c."contextId" = cwim."contextId"
                    and c."orgId" = cwim."orgId"
                    and cwim."orgId" = :orgId
                    and cwim."datasourceId" = :datasourceId
                    and c."obeyaId" is null
                    and cwim."extractRunAt" < (
                        select
                            max(cwim2."extractRunAt")
                        from
                            "contextWorkItemMaps" cwim2
                        join "contexts" c on
                            cwim2."contextId" = c."contextId"
                            and c."orgId" = cwim2."orgId"
                        where
                            cwim2."orgId" = :orgId
                            and cwim2."datasourceId" = :datasourceId
                            and cwim2."extractRunAt" < :currentExtractRunAt
                            and c."obeyaId" is null
                    )
            `;

            await database.query(query, {
                replacements: {
                    orgId,
                    datasourceId,
                    //this is to guard against a timing issue, in case
                    //the current items being inserted beat us to deleting the
                    //previous run, this check means the delete will still
                    //delete the right items.
                    //so this means we ignore items being created in the current
                    //run if they appear before we get here
                    currentExtractRunAt: extractRunAt.toUTC().toISO(),
                },
                type: QueryTypes.DELETE,
            });

            this.logger.debug(
                `[CONTEXT ITEM MAP] deleted all: orgId: ${orgId}, datasourceId: ${datasourceId}, that didn't get updated last time`,
            );
        } catch (err) {
            this.logger.error(
                `[CONTEXT ITEM MAP]: ${orgId}] Failed deleting. %o`,
                err,
            );
        }
    }

    async process(
        orgId: string,
        datasourceId: string,
        contextId: string,
        workItemIdKey: string,
        extractRunAt: DateTime,
    ): Promise<void> {
        await this.updateCwims(
            orgId,
            datasourceId,
            contextId,
            workItemIdKey,
            extractRunAt,
        );
    }

    /**
     * Update the context work item maps
     *
     * Insert the values, and then delete the rows from the database
     * that are not in the current list of rows
     *
     * @param orgId
     * @param datasourceId
     * @param contextId
     * @param workItemIds
     * @param extractRunAt
     */
    private async updateCwims(
        orgId: string,
        datasourceId: string,
        contextId: string,
        workItemIdKey: string,
        extractRunAt: DateTime,
    ): Promise<void> {
        if (!orgId || orgId === '') return undefined;
        if (!datasourceId || datasourceId === '') return undefined;
        if (!workItemIdKey || workItemIdKey === '') return undefined;

        const database = await this.database;
        const transaction = await database.transaction();
        try {
            let workItemIds =
                await this.itemUploader.getWorkItemArrayFromKey(workItemIdKey);
            workItemIds = _.uniq(workItemIds);
            if (workItemIds && workItemIds.length > 0) {
                const contextWorkItemMapModel =
                    ContextWorkItemMapModel(database);

                // Process in chunks
                // Insert 100 items at a time
                // The assumption is inserting too many items in a single query might
                // cause heavy load on the database. So perform bulk insert in chunks
                const chunks = _.chunk(workItemIds, 100);
                for (const chunk of chunks) {
                    const rows = [];
                    for (const workItemId of chunk) {
                        const workItemMap = {
                            contextId,
                            workItemId,
                            orgId,
                            datasourceId,
                            extractRunAt,
                        };
                        rows.push(workItemMap);
                    }

                    await contextWorkItemMapModel.bulkCreate(rows, {
                        transaction,
                        // If the row is a duplicate row, update the following fields
                        // Adding all fields here except createdAt
                        updateOnDuplicate: [
                            'workItemId',
                            'contextId',
                            'orgId',
                            'datasourceId',
                            'extractRunAt',
                            'updatedAt',
                        ],
                    });
                }

                const query = `
                    delete 
                        from "contextWorkItemMaps" cwim
                    where "orgId" = :orgId
                        and "contextId" = :contextId
                        and "datasourceId" = :datasourceId
                        and not ("workItemId" = any(array[:workItemIds]::text[])) 
                `;
                await database.query(query, {
                    transaction,
                    type: QueryTypes.RAW,
                    replacements: {
                        orgId,
                        contextId,
                        datasourceId,
                        workItemIds,
                    },
                });
            }

            await transaction.commit();

            this.logger.info({
                message: 'Updated context work item maps',
                contextId,
                count: workItemIds.length,
                orgId,
                datasourceId,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
            });
        } catch (err) {
            await transaction.rollback();
            this.logger.error({
                message: 'Failed to store context work item maps',
                contextId,
                orgId,
                datasourceId,
                errorMessage: (err as Error).message,
                errorStack: (err as Error).stack,
            });
        }
    }
}
