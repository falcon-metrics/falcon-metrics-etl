import { Logger } from 'pino';
import { o } from 'odata';
import { IFieldMap } from '../../data/field_map_aurora';

import btoa from 'btoa';
import { IWorkItemTypeMap } from '../../data/work_item_type_aurora';
import { ContextItem, IContext } from '../../data/context_aurora';
import { IResponseLogger } from '../process/ab_response_logger';
import { IABQuery } from './ab_query';
import _ from 'lodash';

export interface IABWorkItem {
    getIdsFromAreaPath(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessToken: string,
        areaIds: string[],
        projectId: string,
        excludeItemsCompletedBeforeDate?: Date,
    ): Promise<Array<string>>;
    workItemTypeIdsInProject(projectId: string, orgId: string, datasourceId: string): Promise<string[]>;
}

export class ABWorkItem implements IABWorkItem {
    private logger: Logger;
    private workItemTypeMap: IWorkItemTypeMap;
    private responseLogger: IResponseLogger;
    private abQuery: IABQuery;
    private BATCH_SIZE = 10000;


    constructor(opts: {
        logger: Logger;
        fieldMap: IFieldMap;
        workItemTypeMap: IWorkItemTypeMap;
        context: IContext;
        responseLogger: IResponseLogger;
        abQuery: IABQuery;
    }) {
        this.logger = opts.logger;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.responseLogger = opts.responseLogger;
        this.abQuery = opts.abQuery;
        this.logger = opts.logger;
    }

    async workItemTypeIdsInProject(projectId: string, orgId: string, datasourceId: string) {
        return this.abQuery.workItemTypeIdsInProject(projectId, orgId, datasourceId);
    }

    private async getBatch(
        orgId: string,
        serviceUrl: string,
        accessToken: string,
        projectId: string,
        filter: string,
        startAt = 0
    ) {
        try {
            const handler = o(serviceUrl, {
                headers: this.abQuery.setupHeaders(accessToken),
                fragment: '',
                referrer: undefined
            });

            handler.config = {
                ...handler.config,
                onError: (oHandler: any, res: Response) => {
                    console.error('ADO request failed. URL: ', res.url);
                    this.logger.error(({
                        message: 'Error fetching items from Azure. handler onError',
                        orgId,
                        projectId,
                        url: serviceUrl,
                    }));
                    return null;
                }
            };
            handler.get('WorkItems');

            const result = await handler.query({
                $select: 'WorkItemId',
                $filter: filter,
            });
            return result;
        } catch (e) {
            this.logger.error(({
                message: 'Error in getBatch',
                error: e,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async getIdsFromAreaPath(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessToken: string,
        areaIds: string[],
        projectId: string,
        excludeItemsCompletedBeforeDate?: Date | undefined,
    ): Promise<string[]> {
        try {
            const filter = await this.setupIdsFilter(
                orgId,
                datasourceId,
                areaIds,
                projectId,
                excludeItemsCompletedBeforeDate,
            );
            let results = [];
            const firstBatchResult = await this.getBatch(
                orgId, serviceUrl, accessToken, projectId, filter
            );

            if (Array.isArray(firstBatchResult.value)) {
                results.push(...firstBatchResult.value);
            }

            const remainingItems = await this.abQuery.paginateWithNextLink(firstBatchResult, accessToken);
            results.push(...remainingItems);

            const workItemIds = results
                .filter(elem => elem.WorkItemId !== undefined)
                .map(elem => elem.WorkItemId.toString());
            return workItemIds;
        } catch (e) {
            this.logger.error(({
                message: `getIdsFromAreaPath error with path ${areaIds}`,
                orgId,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
        }
        return [];
    }

    private async setupIdsFilter(
        orgId: string,
        datasourceId: string,
        areaIds: string[],
        projectId: string,
        excludeItemsCompletedBeforeDate?: Date,
    ): Promise<string> {
        const filters = [`Area/AreaId in (${areaIds.join(',')})`];

        const workItemTypeMaps = await this.workItemTypeMap.getWorkItemTypeMaps(
            orgId,
            datasourceId,
        );

        const workItemTypeNames = workItemTypeMaps
            .filter((workItemTypeMap) => workItemTypeMap.projectId === projectId)
            .map(
                (workItemTypeMap) => workItemTypeMap.datasourceWorkItemId,
            );

        let workItemTypeNamePredicate = '';

        if (workItemTypeNames.length > 0) {
            let s = '';
            workItemTypeNames.forEach((workItemTypeName) => {
                s = s + "'" + workItemTypeName + "',";
            });
            s = s.substring(0, s.length - 1);

            workItemTypeNamePredicate = ` AND workitemtype in(${s})`;
        }
        if (workItemTypeNamePredicate && workItemTypeNamePredicate.length > 0) {
            filters.push(workItemTypeNamePredicate);
        }

        if (excludeItemsCompletedBeforeDate)
            // if ClosedDate has no value, AB ignores this filter
            filters.push(
                ` and (ClosedDate eq null or ClosedDate ge ${excludeItemsCompletedBeforeDate.toISOString()})`,
            );
        return filters.join(' ');
    }
}
