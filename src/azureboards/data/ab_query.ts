/* eslint-disable @typescript-eslint/no-non-null-assertion */
import btoa from 'btoa';
import _ from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { o } from 'odata';
import { ContextItem, IContext } from '../../data/context_aurora';
import {
    CustomFieldConfig,
    ICustomFieldConfigs,
} from '../../data/custom_fields_config';
import { PrivateFields } from '../../data/datasource_aurora';
import { IFieldMap } from '../../data/field_map_aurora';
import {
    IWorkItemTypeMap,
    WorkItemTypeMapItem,
} from '../../data/work_item_type_aurora';
import { GetItemParams } from '../../services/check_deleted_items';
import { convertToSurrogateKeyFormat } from '../../utils/date_utils';
import { LogTags } from '../../utils/log_tags';
import { getTimer } from '../../utils/timer';
import { IResponseLogger } from '../process/ab_response_logger';
import { IAbConfig } from './ab_config';
import axios from 'axios';

export enum ABEntityType {
    WORK_ITEMS = 'WorkItems',
    WORK_ITEM_REVISIONS = 'WorkItemRevisions',
}

export type ExtraConfigs = {
    workItemTypeMaps: WorkItemTypeMapItem[];
    contexts: ContextItem[];
    customFields: CustomFieldConfig[];
    privateFields: PrivateFields;
}; //TODO: make sure this is used when we replace the old etl
export interface IABQuery {
    setupHeaders(accessToken: string): any;
    setupQuerySelect(
        orgId: string,
        datasourceId: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
    ): Promise<string>;
    setupQueryExpand(): string;
    setupOrderBy(): string;
    setupQueryFilter(
        orgId: string,
        datasourceId: string,
        changedSince: Date,
        abEntityType: ABEntityType,
        workItemTypeIds: string[],
        excludeItemsCompletedBeforeDate?: Date,
        extraConfigs?: ExtraConfigs,
        projectId?: string
    ): Promise<string>;
    getWorkItems(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        baseUrl: string,
        accessToken: string,
        runDelayInMinutes: number,
        changedSince?: Date,
        batchSize?: number,
        excludeItemsCompletedBeforeDate?: Date,
        projectName?: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
    ): Promise<Array<any>>;
    getWorkItemIds(getItemParams: GetItemParams): Promise<Array<any>>;
    getNextPage(fullUrl: string, accessToken: string): any;
    /**
     * Get all remaining pages
     * 
     * If the server has returned. Azure documentation recommends 
     * we do server side pagination, not client side pagination 
     * 
     * https://learn.microsoft.com/en-us/azure/devops/report/extend-analytics/odata-query-guidelines?view=azure-devops#-dont-use-top-and-skip-query-options-to-implement-client-driven-paging
     */
    paginateWithNextLink(response: any, accessToken: string): Promise<any>;
    workItemTypeIdsInProject(projectId: string, orgId: string, datasourceId: string): Promise<string[]>;
}



export class ABQuery implements IABQuery {
    private workItemTypeMap: IWorkItemTypeMap;
    private fieldMap: IFieldMap;
    private context: IContext;
    private logger: Logger;
    private responseLogger: IResponseLogger;
    private customFieldConfig: ICustomFieldConfigs;
    private abConfig: IAbConfig;
    private timer;
    private witmCache = new Map<string, WorkItemTypeMapItem[]>();
    constructor(opts: {
        logger: Logger;
        fieldMap: IFieldMap;
        workItemTypeMap: IWorkItemTypeMap;
        context: IContext;
        responseLogger: IResponseLogger;
        customFieldConfig: ICustomFieldConfigs;
        abConfig: IAbConfig;
    }) {
        this.logger = opts.logger;
        this.fieldMap = opts.fieldMap;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.context = opts.context;
        this.responseLogger = opts.responseLogger;
        this.customFieldConfig = opts.customFieldConfig;
        this.abConfig = opts.abConfig;
        this.timer = getTimer();
        this.logger = opts.logger;
    }

    private async getWorkItemTypeMaps(orgId: string, datasourceId: string): Promise<WorkItemTypeMapItem[]> {
        const cacheKey = `${orgId}-${datasourceId}`;
        if (this.witmCache.has(cacheKey)) {
            return this.witmCache.get(cacheKey)!;
        }
        const workItemTypeMaps = await this.workItemTypeMap.getWorkItemTypeMaps(
            orgId,
            datasourceId,
        );
        this.witmCache.set(cacheKey, workItemTypeMaps);

        return workItemTypeMaps;
    }

    async workItemTypeIdsInProject(projectId: string, orgId: string, datasourceId: string) {
        const workItemTypeMaps = await this.getWorkItemTypeMaps(orgId, datasourceId);
        //workItemTypeMap.active = False are workitem types that needs to be mapped
        //because old revisions might contain them, but they should not be sent to fetch state items
        // Filter the work item type maps only for the current project
        // Remove duplicates
        const workItemTypeNames = (workItemTypeMaps)
            .filter((workItemTypeMap) =>
                projectId
                    ? workItemTypeMap.projectId === projectId
                    : true
            )
            .filter((workItemTypeMap) => {
                // TODO: Fix this. 
                //  active has been commented out in getWorkItemTypeMaps. So this is always false
                return workItemTypeMap.active !== false;
            })
            .map((workItemTypeMap) => workItemTypeMap.datasourceWorkItemId!);
        return workItemTypeNames;
    }

    async setupQueryFilter(
        orgId: string,
        datasourceId: string,
        changedSince: Date,
        abEntityType: ABEntityType,
        workItemTypeIds: string[] = [],
        excludeItemsCompletedBeforeDate?: Date,
        extraConfigs?: ExtraConfigs,
        projectId?: string
    ): Promise<string> {
        // When bulk updates happen, hundreds of items 
        // have the same ChangedDate timestamp
        // When we do pagination, there's a chance few items
        // that get updated in bulk go missing

        // Shifting the date doesnt work. So the case described above
        // might happen. We'll have to handle that if/when it happens
        const shiftedChangedSince = DateTime
            .fromJSDate(changedSince);
        const filters = [`ChangedDateSK ge ${convertToSurrogateKeyFormat(shiftedChangedSince.toISO()!)}`];

        const workItemTypeMaps =
            extraConfigs?.workItemTypeMaps ||
            (await this.workItemTypeMap.getWorkItemTypeMaps(
                orgId,
                datasourceId,
            ));

        const contexts: Array<ContextItem> =
            extraConfigs?.contexts ||
            (await this.context.getContextsForOrgDataSource(
                orgId,
                datasourceId,
            ));
        let areaPathPredicate = '';

        if (contexts && contexts.length > 0) {
            const areaIds = _
                .chain(contexts)
                .map((item) => item.contextAddress ?? '')
                .map(addrs => addrs.split(','))
                .flatten() // Turns an array of arrays of elements into an array of elements
                .join(',')
                .value();
            areaPathPredicate = ` AND Area/AreaId in (${areaIds})`;
        }

        let workItemTypeNamePredicate = '';

        if (workItemTypeIds.length > 0) {
            workItemTypeNamePredicate = ` AND workitemtype in(${workItemTypeIds.map(i => `"${i}"`).join(',')})`;
        }

        if (ABEntityType.WORK_ITEM_REVISIONS === abEntityType) {
            //Added because of Azure Boards Query Guidelines
            //https://docs.microsoft.com/en-us/azure/devops/report/extend-analytics/odata-query-guidelines?view=azure-devops#perf-define-filter
            filters.push(
                `and (RevisedDateSK eq null or RevisedDateSK gt ${convertToSurrogateKeyFormat(
                    changedSince.toISOString(),
                )})`,
            );
        }

        filters.push(workItemTypeNamePredicate);
        filters.push(areaPathPredicate);
        // filters.push('AND workItemID eq 463278');
        //Only filter for ClosedDate for State Items, because for revisions, we need to get the closed items to be able to exclude all data points of closed work items.
        if (ABEntityType.WORK_ITEMS === abEntityType) {
            if (excludeItemsCompletedBeforeDate) {
                filters.push(
                    `and (ClosedDateSK eq null or ClosedDateSK ge ${convertToSurrogateKeyFormat(
                        excludeItemsCompletedBeforeDate.toISOString(),
                    )})`,
                );
            }
        }

        const filter = filters.join(' ');

        return filter;
    }

    setupOrderBy(): string {
        return ['ChangedDate asc'].join(', ');
    }

    setupQueryExpand(extraConfigs?: ExtraConfigs): string {
        const expandQuery = [
            'Area($select=AreaPath)',
            `Links`,
            // eslint-disable-next-line prettier/prettier
            'Project($Select=ProjectId,ProjectName)'];
        if (extraConfigs?.privateFields.ingestAssignee === true) {
            expandQuery.push('AssignedTo($select=UserName)');
        }
        return expandQuery.join(',');
    }
    private formatCustomFieldName(name: string): string {
        //For analytics api, the "." separator of field name must be replace with "_", wtf
        let validName = name.replace('.', '_');
        validName = validName.split('-').join('__002D'); // an easier replace all https://stackoverflow.com/questions/43310947/replace-all-instances-of-character-in-string-in-typescript
        return validName;
    }
    async setupQuerySelect(
        orgId: string,
        datasourceId: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
    ): Promise<string> {
        const fieldList = await this.fieldMap.getAllDatasourceFieldNamesForOrg(
            orgId,
            datasourceId,
        );

        const customFieldConfigs =
            extraConfigs?.customFields ||
            (await this.customFieldConfig.getCustomFieldConfigs(
                orgId,
                datasourceId,
                projectId,
            ));
        const customFieldsForExtract: Array<string> = customFieldConfigs.map(
            (config) => this.formatCustomFieldName(config.datasourceFieldName),
        );
        const privateField = [];
        if (extraConfigs?.privateFields.ingestTitle) privateField.push('Title');
        return [
            'WorkItemId',
            'WorkItemType',
            'ChangedDate',
            'ChangedDateSK',
            'State',
            'StateCategory',
            'Area',
            'CreatedDate',
            'Revision',
            'ClosedDate',
            'ParentWorkItemId',
            'Reason',
        ]
            .concat(customFieldsForExtract)
            .concat(fieldList)
            .concat(privateField)
            .join(',');
    }

    setupHeaders(accessToken: string) {
        return {
            'Content-Type': 'application/json',
            // Name doesnt matter. can be anything
            Authorization: 'Basic '.concat(btoa('name:'.concat(accessToken))),
        };
    }

    async getWorkItemIds(getItemParams: GetItemParams): Promise<any[]> {
        const { orgId, datasourceId, runParameters, batchSize, workItemIds } =
            getItemParams;
        const { url, accessToken, excludeItemsCompletedBeforeDate } =
            runParameters;
        if (!url || !accessToken) {
            throw Error(
                `[${orgId}][${datasourceId}]: has invalid run parameter ${JSON.stringify(
                    runParameters,
                )}`,
            );
        }
        const handler = o(url, {
            headers: this.setupHeaders(accessToken),
            fragment: '',
            referrer: undefined
        });
        handler.get(ABEntityType.WORK_ITEMS);
        let filter = await this.setupQueryFilter(
            orgId,
            datasourceId,
            new Date(0),
            ABEntityType.WORK_ITEMS,
            undefined,
            excludeItemsCompletedBeforeDate
                ? new Date(excludeItemsCompletedBeforeDate)
                : undefined,
        );
        //add extra filter of work item ids
        filter = filter.concat(` and workItemId in (${workItemIds})`);
        const select = 'WorkItemId';
        const query = {
            $select: select,
            $filter: filter,
            $expand: '',
            $orderBy: 'workItemId',
        };
        this.logger.info({
            message: 'validating work item ids with query',
            datasourceId,
            orgId,
            query
        });
        const results = [];

        const firstBatchResult = await handler.query(query);

        if (Array.isArray(firstBatchResult.value)) {
            results.push(...firstBatchResult.value ?? []);
        }

        const remainingResults = await this.paginateWithNextLink(firstBatchResult, accessToken);
        results.push(...remainingResults);

        return results;
    }

    buildBatchQueryBody(url: URL) {
        // String cant be indented. Do no indent this string. The request body will end
        // up having spaces and that is invalid
        return (
            `--batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d
Content-Type: application/http
Content-Transfer-Encoding: binary

GET ${url.toString()} HTTP/1.1
Accept: application/json

--batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d`
        );
    };

    setupBatchHeaders(accessToken: string) {
        // Name doesnt matter. can be anything
        const buf = Buffer.from('name:'.concat(accessToken));
        return {
            'Content-Type': 'multipart/mixed; boundary=batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d',
            'Authorization': 'Basic '.concat(buf.toString('base64')),
        };
    };

    /**
     * Get a batch of data. The batch size is expected to be in the `query`
     * 
     * Use `skip` for pagination
     */
    private async getBatch(
        serviceUrl: string,
        accessToken: string,
        query: any,
        baseUrl: string
    ) {
        let promise: Promise<any> | undefined;
        let result;
        const constructedUrl = serviceUrl + '/WorkItems' + '?' + Object.entries(query).map(e => e[0] + '=' + e[1]).join('&');
        try {
            if (constructedUrl.length >= 3000) {
                const url = baseUrl + '/_odata/v2.0/$batch';
                let bodyUrl = new URL('WorkItems', serviceUrl);
                Object
                    .entries(query)
                    .forEach(([key, value]) => {
                        bodyUrl.searchParams.append(key, (value as string));
                    });
                const body = this.buildBatchQueryBody(bodyUrl);
                this.logger.info(({
                    message: 'Batch request params',
                    serviceUrl,
                    query,
                    url,
                    body
                }));
                const response = await axios.post(
                    url.toString(),
                    body,
                    {
                        headers: this.setupBatchHeaders(accessToken)
                    }
                );
                return response.data?.responses[0]?.body || {};
            } else {
                const handler = o(serviceUrl, {
                    headers: this.setupHeaders(accessToken),
                    fragment: '',
                    referrer: undefined,
                    onError: (handler, res) => {
                        // promise = res.json();
                        this.logger.error(({
                            message: 'onError handler error',
                            responseStatus: res.status
                        }));
                        return null;
                    }
                });
                handler.get('WorkItems');
                result = await handler.query(query);
                return result;
            }
        } catch (e) {
            this.logger.error(({
                message: 'getBatch error',
                serviceUrl,
                query,
                result,
                // response: json,
                error: e
            }));
            throw new Error("Caught error in getBatch");
        }
    }

    private async getDataForDate(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        baseUrl: string,
        accessToken: string,
        changedSince: Date = new Date(0),
        excludeItemsCompletedBeforeDate?: Date,
        batchSize = 100,
        projectName?: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
    ): Promise<any[]> {
        let query: Record<string, any> = {};
        try {

            // TODO: Inorder to fix the type check override here the code needs a big refactor
            const witm = await this.workItemTypeIdsInProject(projectId!, orgId, datasourceId);
            if (witm.length === 0) {
                this.logger.info(({
                    message: 'No work item types configured for this project. Skipping the extract for this project',
                    projectId,
                    projectName,
                    orgId,
                    datasourceId
                }));
                return [];
            }

            const filter = await this.setupQueryFilter(
                orgId,
                datasourceId,
                changedSince,
                ABEntityType.WORK_ITEMS,
                witm,
                excludeItemsCompletedBeforeDate,
                extraConfigs,
                projectId,
            );

            const select = await this.setupQuerySelect(
                orgId,
                datasourceId,
                projectId,
                extraConfigs,
            );
            const expand = this.setupQueryExpand(extraConfigs);
            const orderBy = this.setupOrderBy();
            // console.log('select: %o', select);
            // console.log('filter: %o', filter);
            // console.log('expand: %o', expand);
            // console.log('orderBy: %o', orderBy);
            query = {
                $select: select,
                $expand: expand,
                $filter: filter,
                $orderby: orderBy,
            };
            this.logger.info(({
                message: `Fetching from datasource`,
                orgId,
                url: serviceUrl,
                query,
                projectId,
                projectName,
                lastChangedDate: changedSince
            }));

            const results = [];

            // Get first batch
            this.timer.start('getBatch');
            const firstBatchResult = await this.getBatch(serviceUrl, accessToken, query, baseUrl);
            if (Array.isArray(firstBatchResult.value)) {
                results.push(...firstBatchResult.value);
            }
            this.logger.info(({
                message: `Fetched workitems from datasource`,
                count: firstBatchResult.length,
                orgId,
                url: serviceUrl,
                query,
                projectId,
                projectName,
                lastChangedDate: changedSince,
                elapsedTime: `${this.timer.end('getBatch') / 1000} seconds`,
                tags: [LogTags.EXTRACT],
            }));


            // Defining a method here to reuse in the loop
            const shouldFetchNextBatch = (result: any) => {
                const changedDateSK = convertToSurrogateKeyFormat(DateTime.fromJSDate(changedSince).toISO()!);
                let last: Record<string, any> = _.last(result.value ?? []) ?? {};
                const nextLink = result['@odata.nextLink'];
                const fetchNextBatch = (nextLink !== undefined) &&
                    (last !== undefined) &&
                    (last.ChangedDateSK !== undefined) &&
                    (last.ChangedDateSK.toString() === changedDateSK);

                if (fetchNextBatch && nextLink === undefined) {
                    this.logger.error(({
                        message: '@odata.nextLink not in the response',
                        orgId,
                        url: serviceUrl,
                        query,
                        projectId,
                        projectName,
                    }));
                }

                return fetchNextBatch;
            };



            /**
             * This only runs if the number of items changed in a day is more than 10000
             * That should be very rare if it even happens. There is no way to test this
             * part of the code by running in prod at this time.
             */
            let fetchNextBatch = shouldFetchNextBatch(firstBatchResult);
            // Fallback to prevent an infinite loop
            let page = 1;
            while (fetchNextBatch && page < 5) {
                this.logger.error(({
                    message: 'Fetching next batch',
                    orgId,
                    url: serviceUrl,
                    query,
                    projectId,
                    projectName,
                }));
                const result = await this.getNextPage(serviceUrl, accessToken);
                if (Array.isArray(result.value)) {
                    results.push(...result.value);
                }
                fetchNextBatch = shouldFetchNextBatch(result);
                page += 1;
            }

            /**
             * Azure doesnt support filtering by the timestamp. It only supports filtering by date
             * So we fetch all the items that changed on the day and then filter the items here
             */
            const changedSinceDateTime = DateTime.fromJSDate(changedSince);
            this.logger.info(({
                message: `Workitem length before filtering`,
                count: results.length,
                item: JSON.stringify(results[0])
            }));
            // console.log('before filtering : ', results.length);
            const filtered = _.chain(results)
                .map(obj => ({ ...obj, changedDateTime: DateTime.fromISO(obj.ChangedDate) }))
                .filter((obj, i) =>
                    (obj.changedDateTime as DateTime) > changedSinceDateTime
                )
                .filter((elem, i) => i < batchSize)
                .value();
            this.logger.info(({
                message: `Workitem length after filtering`,
                count: filtered.length,
                item: JSON.stringify(filtered[0]),
                endItem: JSON.stringify(filtered[filtered.length - 1])
            }));
            // console.log('after filtering : ', filtered.length);
            return filtered;
        } catch (e) {
            this.logger.error(({
                message: 'Error fetching items from Azure',
                orgId,
                projectId,
                projectName,
                url: serviceUrl,
                query,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                response: JSON.parse(JSON.stringify(e))
            }));
            //if response is 404, update the project deletedAt to today ---> currently disabled
            // if (r instanceof Response) {
            //     if (r.status === 404 && projectId) {
            //         this.logger.error(
            //             `[ADO][${orgId}] archiving project [${projectName}]: `,
            //         );
            //         this.abConfig.archiveConfig(
            //             orgId,
            //             datasourceId,
            //             [projectId],
            //             AbConfigType.PROJECT,
            //         );
            //     }
            // }
            return [];
        }
        //Pass the parameter fragment: '', because otherwise the library will return only the property 'value' from the JSON
    }

    async getNextPage(fullUrl: string, accessToken: string) {
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: this.setupHeaders(accessToken),

        });

        this.logger.info(({
            message: 'Azure API response code',
            url: fullUrl,
            httpCode: response.status,
        }));

        const data = await response.json();

        return data;
    }

    async paginateWithNextLink(result: any, accessToken: string) {
        // if there is a @odata.nextLink link in the response
        //     then there are more results available for the query we made,
        //     so we need to keep requesting the next page until there
        //     is no longer a @odata.nextLink in the response;
        let nextPageLink = undefined;
        if ('@odata.nextLink' in result) {
            nextPageLink = result['@odata.nextLink'];
        }

        let hasMorePages = nextPageLink ? true : false;

        let pageNumber = 1;
        let items = [];
        while (hasMorePages) {
            this.logger.info(({
                message: 'Fetching page',
                pageNumber,
                nextPageLink,
            }));
            const pageResults: any = await this.getNextPage(
                nextPageLink,
                accessToken,
            );

            if ('value' in pageResults) {
                items.push(...pageResults['value']);
            }

            nextPageLink = undefined;
            if ('@odata.nextLink' in pageResults) {
                nextPageLink = pageResults['@odata.nextLink'];
            }

            hasMorePages = nextPageLink ? true : false;
            pageNumber += 1;
        }
        return items;
    }

    async getWorkItems(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        baseUrl: string,
        accessToken: string,
        runDelayInMinutes: number,
        changedSince: Date = new Date(0),
        batchSize = 100,
        excludeItemsCompletedBeforeDate?: Date,
        projectName?: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
    ): Promise<Array<any>> {
        try {
            let items: Array<any> = [];
            let hasMorePages = false;

            let startTimeInMillis = DateTime.now().toMillis();

            const result = await this.getDataForDate(
                orgId,
                datasourceId,
                serviceUrl,
                baseUrl,
                accessToken,
                changedSince,
                excludeItemsCompletedBeforeDate,
                batchSize,
                projectName,
                projectId,
                extraConfigs,
            );

            //Log any warnings or errors from Azure Boards
            items = items.concat(result);


            // May need more mapping here to cater for types not supported by JSON
            // TODO: Understand why this mapping is happening and potentially remove it
            items.forEach((item: any) => {
                item.ChangedDate = new Date(item.ChangedDate);
            });


            let logMessage = `ADO: [STATE:${orgId}] ${items.length} Work Items extracted for transformation. Since ${changedSince}. Batch size: ${batchSize}`;

            this.logger.info(({
                message: logMessage,
                batchSize,
                changedSince,
                orgId,
                projectId,
                projectName,
                url: serviceUrl,
            }));

            return items;
        } catch (r) {
            throw r;
        }
    }
}
