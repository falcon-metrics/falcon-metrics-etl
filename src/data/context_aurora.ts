import { Logger } from 'pino';
import { Op, QueryTypes, Sequelize } from 'sequelize';
import { ContextModel } from './models/ContextModel';
import { DateTime } from 'luxon';

export interface ContextItem {
    id: string;
    orgId: string;
    name?: string;
    contextAddress?: string;
    projectId?: string;
    positionInHierarchy?: string;
    /**
     * true if the data for this context has to be reingested
     *
     * Ideally this must be a required field as it is a non-nullable
     * column in the database. But, it is optional because making
     * it required needs a big refactor.
     */
    reingest?: boolean;
    datasourceId: string;
    // Function to lazy load the last ingested date
    getLastIngestedDate?: () => Promise<DateTime | undefined>;
    markContextAsIngested?: () => Promise<any>;
}

export interface IContext {
    getContextsForOrgDataSource(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<ContextItem>>;
    getIdForAddress(
        orgId: string,
        datasourceId: string,
        contextAddress: string,
    ): Promise<string | undefined>;
    archiveContexts(
        orgId: string,
        datasourceId: string,
        contextAddresses: (string | undefined)[],
    ): Promise<void>;
}

export class Context implements IContext {
    protected logger: Logger;
    private database: Promise<Sequelize>;
    private contextCache: Map<string, Array<ContextItem>> = new Map();

    constructor(opt: { logger: Logger; database: Promise<Sequelize> }) {
        this.logger = opt.logger;
        this.database = opt.database;
        this.logger = opt.logger;
    }

    async getContextsForOrgDataSource(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<ContextItem>> {
        const cacheKey = `${orgId}#${datasourceId}`;
        if (this.contextCache.has(cacheKey)) {
            return this.contextCache.get(cacheKey)!;
        }

        if (!orgId || !datasourceId || orgId === '' || datasourceId === '')
            throw new Error(
                'Either orgId or datasourceId are empty or undefined. Both are required.',
            );

        const contextModel = ContextModel(await this.database, Sequelize);
        const allContextDb = await contextModel.findAll({
            where: {
                orgId,
                datasourceId,
                archived: {
                    [Op.or]: [false, null],
                },
            },
        });
        const contexts = new Array<ContextItem>();
        for (const contextDbItem of allContextDb) {
            const contextId = contextDbItem.get('contextId') as string;
            const contextItem: ContextItem = {
                id: contextId,
                orgId,
                name: contextDbItem.get('name') as string,
                contextAddress: contextDbItem.get('contextAddress') as string,
                projectId: contextDbItem.get('projectId') as string,
                positionInHierarchy: contextDbItem.get(
                    'positionInHierarchy',
                ) as string,
                reingest: contextDbItem.get('reingest') as boolean,
                datasourceId: contextDbItem.get('datasourceId') as string,
                getLastIngestedDate: () =>
                    this.getLastIngestedInContext(orgId, contextId),
                markContextAsIngested: () =>
                    contextDbItem.update({ reingest: false }),
            };

            contexts.push(contextItem);
        }

        this.contextCache.set(cacheKey, contexts);

        return contexts;
    }
    async getIdForAddress(
        orgId: string,
        datasourceId: string,
        contextAddress: string,
    ): Promise<string | undefined> {
        const contextModel = ContextModel(await this.database, Sequelize);
        const contextDb = await contextModel.findOne({
            where: {
                orgId,
                datasourceId,
                contextAddress,
            },
        });

        return (contextDb?.get('contextId') as string) ?? undefined;
    }
    async archiveContexts(
        orgId: string,
        datasourceId: string,
        contextAddresses: string[],
    ): Promise<void> {
        const contextModel = ContextModel(await this.database, Sequelize);
        await contextModel.update(
            { archived: true },
            {
                where: {
                    orgId,
                    datasourceId,
                    contextAddress: contextAddresses,
                },
            },
        );
    }

    async getLastIngestedInContext(orgId: string, contextId: string) {
        try {
            // Get the last ingested item in each group
            const query = `
                select 
                    s."workItemId",
                    s."changedDate"
                from states s
                join "contextWorkItemMaps" cwim 
                    on cwim."workItemId" = s."workItemId" 
                    and s."partitionKey" = 'state#' || cwim."orgId" 
                    and cwim."contextId" = :contextId
                    and cwim."orgId" = :orgId
                order by s."updatedAt" desc
                limit 1
            `;

            const database = await this.database;
            const rows: any[] = await database.query(query.trim(), {
                replacements: {
                    orgId,
                    contextId,
                },
                type: QueryTypes.SELECT,
            });
            let date: DateTime | undefined;
            if (rows.length === 0) {
                this.logger.info({
                    message: 'getLastIngestedInContext - Fetched zero items',
                    orgId,
                    contextId,
                    rows,
                });
            } else if (rows.length > 0) {
                const changedDate = rows[0]?.changedDate;
                if (changedDate) {
                    date = DateTime.fromJSDate(changedDate);
                } else {
                    this.logger.error({
                        message:
                            'getLastIngestedInContext - changeDate invalid',
                        orgId,
                        contextId,
                        rows,
                    });
                }
            }
            return date;
        } catch (e) {
            this.logger.error({
                message: 'Error in getLastIngestedInContext',
                orgId,
                contextId,
                errorMessage: e.message,
                errorStack: e.stack,
            });
            throw e;
        }
    }
}
