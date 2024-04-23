import { Logger } from 'pino';
import fetch, { Response } from 'node-fetch';
import { IFieldMap } from '../../data/field_map_aurora';

import { WorkItemTypeMapItem } from '../../data/work_item_type_aurora';
import { ContextItem } from '../../data/context_aurora';
import {
    CustomFieldConfig,
    ICustomFieldConfigs,
} from '../../data/custom_fields_config';
import { PrivateFields, ServiceDetails } from '../../data/datasource_aurora';
import { setupHeaders } from './utils';
import { CheckConditions } from '../../services/check_deleted_items';
import { RateLimitError } from '../../common/types_and_constants';
import { FG_COLOR } from '../../utils/log_colors';
import { isTimeToQuit } from '../../common/extract_utils';
import { LogTags } from '../../utils/log_tags';
import _ from 'lodash';
import { DateTime } from 'luxon';

export interface IJCIssue {
    getFields(
        serviceUrl: string,
        accessCredentials: string,
    ): Promise<Array<any>>;
    getWorkItemsFromDatasource(
        orgId: string,
        datasourceId: string,
        runParameters: ServiceDetails,
        startTimeInMillis: number,
        context: ContextItem[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        settings: PrivateFields,
        batchSize?: number,
        expandChangeLog?: boolean,
        projectIds?: string[],
        customFieldConfigs?: CustomFieldConfig[],
    ): Promise<Array<any>>;

    getIdsFromFilter(
        orgId: string,
        serviceUrl: string,
        accessToken: string,
        context: ContextItem,
        projectIds: string[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        excludeItemsCompletedBeforeDate?: Date,
    ): Promise<Array<string>>;

    getIssues(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessCredentials: string,
        issueKeys: string[],
        batchSize?: number,
        checkConditions?: CheckConditions,
    ): Promise<any>;
    validToken(serviceUrl: string, accessToken: string): Promise<boolean>;

    setupQueryFilter(
        orgId: string,
        contexts: ContextItem[],
        changedSince: Date,
        workItemTypeMaps: WorkItemTypeMapItem[],
        excludeItemsCompletedBeforeDate?: Date,
        projectIds?: string[],
    ): string;
}

export class JCIssue implements IJCIssue {
    private logger: Logger;
    private fieldMap: IFieldMap;
    private customFieldConfig: ICustomFieldConfigs;
    private flaggedFieldsSet = new Set([
        'Flagged',
        'Marcado'
    ]);
    private UNIX_EPOCH = DateTime.fromMillis(0);

    constructor(opts: {
        logger: Logger;
        fieldMap: IFieldMap;
        customFieldConfig: ICustomFieldConfigs;
    }) {
        this.logger = opts.logger;
        this.logger = opts.logger;
        this.fieldMap = opts.fieldMap;
        this.customFieldConfig = opts.customFieldConfig;
    }

    async validToken(
        serviceUrl: string,
        accessCredentials: string,
    ): Promise<boolean> {
        const fullUrl = `${serviceUrl}`.concat(
            '/search?&maxResults=1&jql=updated > 0 &fields=id',
        );
        const response = await fetch(fullUrl, {
            headers: this.setupHeaders(accessCredentials),
        });

        this.logger.info(({
            message: 'Jira API response code',
            url: fullUrl,
            httpCode: response.status,
            responseHeaders: response.headers,
            methodName: 'validToken',
        }));

        const res = await response.json();
        if (!response.ok || res.total === 0) {
            //here because we did not add any jql filter, so it will be wrong if there is no result.
            return false;
        }
        return true;
    }

    async getFields(
        serviceUrl: string,
        accessCredentials: string,
    ): Promise<Array<any>> {
        const endpoint = serviceUrl.endsWith('/') ? 'field' : '/field';
        const fullUrl = `${serviceUrl}${endpoint}`;

        const response = await fetch(fullUrl, {
            headers: this.setupHeaders(accessCredentials),
        });

        this.logger.info(({
            message: 'Jira API response code',
            methodName: 'getFields',
            url: fullUrl,
            httpCode: response.status,
            responseHeaders: response.headers,
        }));

        if (!response.ok) {
            throw response;
        }

        const fields = await response.json();

        if (!fields || !fields.length) {
            return [];
        }

        return fields;
    }

    async getIdsFromFilter(
        orgId: string,
        serviceUrl: string,
        accessCredentials: string,
        context: ContextItem,
        projectIds: string[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        excludeItemsCompletedBeforeDate?: Date,
    ): Promise<any[]> {
        let fullUrl;
        try {
            const endpoint = serviceUrl.endsWith('/') ? 'search?' : '/search?';
            const filterId = Number.parseInt(context.contextAddress!);

            if (isNaN(filterId))
                throw new TypeError(
                    'The contextAddress supplied for extracting Jira Issues must be an integer matching a Filter id. Check the config setup!',
                );

            const pageSize = 50;
            let startAt = 0;
            let total = 0;
            let countSoFar = 0;
            let pageNumber = 1;

            let keys: Array<string> = [];

            do {
                fullUrl = `${serviceUrl}${endpoint}`
                    .concat(`startAt=${startAt}`)
                    .concat(`&maxResults=${pageSize}`)
                    .concat(`&jql=${this.setupQueryFilter(
                        orgId,
                        [context],
                        // Extract from the beginning (all workitem ids)
                        new Date(0),
                        workItemTypeMaps,
                        excludeItemsCompletedBeforeDate,
                        projectIds,
                    )}`)
                    // .concat('&fields=key');
                    // query for multiple fields for testing
                    .concat('&fields=id,key,updated,status,issuetype,created');

                const response = await fetch(fullUrl, {
                    headers: this.setupHeaders(accessCredentials),
                });

                this.logger.info(({
                    message: 'Jira API response code',
                    methodName: 'getIdsFromFilter',
                    url: fullUrl,
                    httpCode: response.status,
                    responseHeaders: response.headers,
                    startAt,
                    orgId,
                }));

                if (!response.ok) {
                    if (response.status === 429) {
                        this.logger.error(
                            {
                                message: 'Context Extract Rate Limited',
                                responseHeaders: response.headers.raw()
                            },
                        );
                    }
                    throw response;
                }

                const result = await response.json();



                // TODO: Remove this. adding for debugging, 
                // this.logger.info(({
                //     message: 'getIdsFromFilter issues',
                //     methodName: 'getIdsFromFilter',
                //     url: fullUrl,
                //     httpCode: response.status,
                //     responseHeaders: response.headers,
                //     startAt,
                //     result
                // }));


                if (!result.issues) break;

                const thisPageKeys: string[] = result.issues.map(
                    (issue: any) => issue.key,
                );
                keys = keys.concat(thisPageKeys);

                startAt = keys.length;
                total = result.total;
                countSoFar = keys.length;

                pageNumber += 1;
            } while (countSoFar < total);

            this.logger.info({
                test: `JC: [${orgId}] [CONTEXT] ${countSoFar} of ${total} ids for context address [${context.contextAddress}] extracted. pages: ${pageNumber}`,
                message: ''
            });

            return keys;
        } catch (e) {
            if (!(e as any).statusText) throw e;

            const response = e as Response;

            this.logger.error(({
                message: 'Error when fetching ids',
                orgId,
                context,
                fullUrl,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                error: e
            }));
            throw new Error(response.statusText);
        }
    }
    async getIssues(
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessCredentials: string,
        issueKeys: string[],
        batchSize = 100,
        checkConditions?: CheckConditions,
    ): Promise<any> {
        let fullUrl = `${serviceUrl}/search?`
            .concat(`&maxResults=${batchSize}`)
            .concat(`&jql= issue in (${issueKeys})`);
        if (checkConditions) {
            if (checkConditions.projects && checkConditions.projects.length) {
                fullUrl = fullUrl.concat(
                    `and project in (${checkConditions.projects})`,
                );
            }
            if (
                checkConditions.workItemTypes &&
                checkConditions.workItemTypes.length
            ) {
                fullUrl = fullUrl.concat(
                    `and issuetype in (${checkConditions.workItemTypes})`,
                );
            }
        }
        fullUrl = fullUrl.concat('&fields=id,key');
        const response = await fetch(fullUrl, {
            headers: this.setupHeaders(accessCredentials),
        });

        this.logger.info(({
            message: 'Jira API response code',
            methodName: 'getIssues',
            url: fullUrl,
            httpCode: response.status,
            responseHeaders: response.headers,
        }));

        if (!response.ok) {
            const body = await response.json();
            if (
                body.errorMessages[0] ===
                'Issue does not exist or you do not have permission to see it.' //this happens when all the items in this batch is deleted;
            )
                return { total: 0, issues: [] };

            throw response;
        }

        return await response.json();
    }
    async getBatchFromDatasource({
        orgId,
        datasourceId,
        serviceUrl,
        accessCredentials,
        settings,
        contexts,
        workItemTypeMaps,
        startAt,
        datasourceType,
        excludeItemsCompletedBeforeDate,
        expandChangeLog = true,
        projectIds,
        changedSince = new Date(0),
        customFieldConfigs,
        flaggedFieldName
    }: {
        orgId: string;
        datasourceId: string;
        serviceUrl: string;
        accessCredentials: string;
        settings: PrivateFields;
        contexts: ContextItem[];
        workItemTypeMaps: WorkItemTypeMapItem[];
        startAt: number;
        datasourceType: string;
        excludeItemsCompletedBeforeDate?: Date;
        expandChangeLog?: boolean;
        projectIds?: string[];
        changedSince?: Date;
        customFieldConfigs?: CustomFieldConfig[];
        flaggedFieldName: string | undefined;
    }): Promise<any> {
        const pageSize = datasourceType === 'jira-server' ? 10 : 50;
        let fullUrl = `${serviceUrl}/search?`
            .concat(`&startAt=${startAt}`)
            .concat(`&maxResults=${pageSize}`)
            .concat(
                `&jql=${this.setupQueryFilter(
                    orgId,
                    contexts,
                    changedSince,
                    workItemTypeMaps,
                    excludeItemsCompletedBeforeDate,
                    projectIds,
                )} ${this.setupSort()}`,
            )
            .concat(
                `&fields=${await this.setupQuerySelect({
                    orgId,
                    datasourceId,
                    settings,
                    customFieldConfigs,
                    flaggedFieldName
                })}`,
            );
        if (expandChangeLog) {
            fullUrl = fullUrl.concat(`&expand=${this.setupQueryExpand()}`);
        }

        const response = await fetch(fullUrl, {
            headers: this.setupHeaders(accessCredentials),
        });

        this.logger.info(({
            message: 'Jira API response code',
            methodName: 'getBatchFromDatasource',
            url: fullUrl,
            httpCode: response.status,
            responseHeaders: response.headers,
        }));

        if (!response.ok) {
            if (response.status === 429) {
                const retryDateString =
                    response.headers.get('X-RateLimit-Reset')!;

                this.logger.error({
                    message: 'Rate Limited',
                    responseHeaders: response.headers.raw(),
                    url: fullUrl,
                    retryDateString
                });

                const rateLimitError: RateLimitError = {
                    rateLimited: true,
                    retryDateString,
                };
                throw rateLimitError;
            }
            throw response;
        }

        const result = await response.json();

        if (!result.issues) {
            this.logger.info({
                message: '0 issue fetched',
                orgId,
                datasourceId,
                url: fullUrl
            });

            return [];
        }

        return result;
    }

    private getMinDate(d1: DateTime, d2: DateTime) {
        return DateTime.fromMillis(
            _.min([
                d1.toMillis(),
                d2.toMillis()
            ]) as number
        ).toJSDate();
    }

    async getWorkItemsFromDatasource(
        orgId: string,
        datasourceId: string,
        runParameters: ServiceDetails,
        startTimeInMillis: number,
        contexts: ContextItem[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        settings: PrivateFields,
        batchSize = 100,
        expandChangeLog = true,
        projectIds?: string[],
        customFieldConfigs?: CustomFieldConfig[],
    ): Promise<Array<any>> {
        this.logger = this.logger.child({
            orgId,
            datasourceId,
            datasourceType: runParameters.datasourceType
        });
        try {
            const serviceUrl = runParameters.url!;
            const accessCredentials = runParameters.accessToken!;
            const datasourceType = runParameters.datasourceType;
            const changedSince = runParameters.nextRunStartFrom
                ? new Date(runParameters.nextRunStartFrom)
                : new Date(0);
            const excludeItemsCompletedBeforeDate = runParameters.excludeItemsCompletedBeforeDate
                ? new Date(runParameters.excludeItemsCompletedBeforeDate)
                : undefined;

            let issues: Array<any> = [];

            let startAt = 0;
            let total = 0;
            let pageNumber = 1;
            if (!projectIds) return issues;

            // Fetch the name of the flagged field
            const flaggedFieldName = await this.getFlaggedFieldName(runParameters);

            if (datasourceType === 'jira-server') {
                const chunks = _.chunk(contexts, 2);
                for (const chunk of chunks) {
                    this.logger.info(({
                        message: 'Starting data extract for chunk of filters',
                        datasourceType,
                        orgId,
                        chunk
                    }));
                    if (isTimeToQuit(startTimeInMillis, runParameters.runDelayInMinutes)) {
                        this.logger.info(({
                            message: `quit paging at page number ${pageNumber}`,
                            orgId,
                            datasourceId,
                            tags: [LogTags.EXTRACT]
                        }));
                        break;
                    }
                    const results = await Promise.all(
                        chunk.map((context) => {
                            const f = async () => {
                                // If changedSince is undefined, start extract since the beginning
                                // Else extract since the last extracted date
                                let lastChangedDate = this.UNIX_EPOCH;
                                if (!context.reingest && context.getLastIngestedDate) {
                                    lastChangedDate = (await context.getLastIngestedDate()) ?? this.UNIX_EPOCH;
                                }
                                const changedDate = this.getMinDate(
                                    DateTime.fromJSDate(changedSince),
                                    lastChangedDate
                                );
                                this.logger.info({
                                    message: 'Computed changedDate',
                                    lastChangedDate,
                                    changedSince,
                                    nextRunStartFrom: runParameters.nextRunStartFrom,
                                    context
                                });
                                const data = await this.getDataFromFilter({
                                    orgId,
                                    datasourceId,
                                    serviceUrl,
                                    accessCredentials,
                                    settings,
                                    context,
                                    workItemTypeMaps,
                                    startAt,
                                    datasourceType,
                                    excludeItemsCompletedBeforeDate,
                                    expandChangeLog,
                                    projectIds,
                                    changedSince: changedDate,
                                    customFieldConfigs,
                                    flaggedFieldName,
                                    batchSize
                                });
                                return data.map(item => ({ ...item, context }));
                            };
                            return f();
                        })
                    );

                    this.logger.info(({
                        message: 'Finished data extract for chunk of filters',
                        datasourceType,
                        orgId,
                        chunk
                    }));
                    issues.push(..._.flatten(results));
                }
                this.logger.info(({
                    message: 'Finished data extract for all filters',
                    datasourceType,
                    orgId,
                }));
            } else {
                //there may be more results than can be returned in one response, so we perform paging
                do {
                    if (isTimeToQuit(startTimeInMillis, runParameters.runDelayInMinutes)) {
                        this.logger.info(({
                            message: `quit paging at page number ${pageNumber}`,
                            orgId,
                            datasourceId,
                            tags: [LogTags.EXTRACT]
                        }));
                        break;
                    }

                    const result = await this.getBatchFromDatasource({
                        orgId,
                        datasourceId,
                        serviceUrl,
                        accessCredentials,
                        settings,
                        contexts,
                        workItemTypeMaps,
                        startAt,
                        datasourceType,
                        excludeItemsCompletedBeforeDate,
                        expandChangeLog,
                        projectIds,
                        changedSince,
                        customFieldConfigs,
                        flaggedFieldName
                    });

                    total = result.total;

                    if (result.issues && result.issues.length === 0) {
                        break;
                    }

                    issues = issues.concat(result.issues);
                    startAt = issues.length;

                    this.logger.info({
                        message: 'Extracted a batch of items',
                        pageNumber,
                        count: issues.length,
                        orgId,
                    });

                    if (issues.length >= batchSize) {
                        this.logger.info({
                            // What does this log mean? 
                            message: 'results is >= than batch size in doQueryMultipleSortedByUpdatedDate',
                            pageNumber,
                            count: issues.length,
                            orgId,
                            serviceUrl
                        });
                        break;
                    }
                } while (issues.length < total);

                this.logger.info({
                    // What does this log mean? 
                    message: 'Extracted work items',
                    pageNumber,
                    count: issues.length,
                    orgId,
                    datasourceId,
                    serviceUrl,
                    batchSize,
                    changedSince
                });
            }

            return issues;
        } catch (e) {
            this.logger.error({
                message: 'Error in getWorkItemsFromDatasource',
                errorMessage: e.message,
                errorStack: e.stack
            });

            if (!(e instanceof Response)) throw e;

            const response = e as Response;
            const responseText = await response.text();
            this.logger.error({
                message: 'Error in getWorkItemsFromDatasource',
                errorMessage: responseText,
            });
            throw new Error(response.statusText);
        }
    }

    private setupHeaders(accessCredentials: string) {
        return setupHeaders(accessCredentials);
    }

    private async setupQuerySelect({
        orgId,
        datasourceId,
        settings,
        customFieldConfigs,
        flaggedFieldName
    }: {
        orgId: string;
        datasourceId: string;
        settings: PrivateFields;
        customFieldConfigs?: CustomFieldConfig[];
        /**
         * Name of the flagged field. This is is not
         * the same for all orgs
         * 
         * flaggedFieldName is allowed to be undefined. 
         * When the language configured in Jira is not one of the languages
         * we check when searching for the flagged field, it may be undefined. 
         */
        flaggedFieldName: string | undefined;
    }): Promise<string> {
        const fieldList = await this.fieldMap.getAllDatasourceFieldNamesForOrg(
            orgId,
            datasourceId,
        );
        //for compatible with old extract, TODO: remove the getCustomFieldConfigs here after new extract fully
        const customFieldConfigsInQuery =
            customFieldConfigs ||
            (await this.customFieldConfig.getCustomFieldConfigs(
                orgId,
                datasourceId,
            ));
        const customFieldsForExtract: Array<string> =
            customFieldConfigsInQuery.map(
                (config) => config.datasourceFieldName,
            );

        const privateFields = [];
        if (settings && settings.ingestAssignee) {
            privateFields.push('assignee');
        }

        if (settings && settings.ingestTitle) {
            privateFields.push('summary');
        }

        const fields = [
            'id', //TODO: id not used, can remove it
            // 'summary', //private field, only ingest when configured
            'key', //this is the jira number
            'updated',
            'status',
            'issuetype',
            'created', //TODO: remove later not used
            'statuscategorychangedate',
            'changelog',
            // 'assignee',//private field, only ingest when configured
            'parent',
            // Parent ID in Jira server
            'customfield_15503',
            'project',
            'issuelinks', //TODO: issue links is linked item
            'resolution',
        ];
        if (flaggedFieldName) {
            fields.push(flaggedFieldName);
        }
        return fields
            .concat(privateFields)
            .concat(customFieldsForExtract)
            .concat(fieldList)
            .join(',');
    }

    private setupQueryExpand(): string {
        return ['changelog', 'project'].join(',');
    }

    setupQueryFilter(
        orgId: string,
        contexts: ContextItem[],
        changedSince: Date,
        workItemTypeMaps: WorkItemTypeMapItem[],
        excludeItemsCompletedBeforeDate?: Date,
        projectIds?: string[],
    ): string {
        const filterIds = contexts.map((context) => context.contextAddress);
        const filters = [`updated > ${changedSince.valueOf()}`];
        if (filterIds && filterIds.length) {
            filters.push(`and filter in (${filterIds.join(',')})`);
        }
        if (projectIds && projectIds.length) {
            const projectWorkItemTypeFilters = [];
            for (const projectId of projectIds) {
                const projectWorkItemTypes = workItemTypeMaps
                    .filter(w => w.projectId === projectId)
                    .map(w => w.datasourceWorkItemId);

                if (projectWorkItemTypes.length > 0) {
                    projectWorkItemTypeFilters
                        .push(`(project in (${projectId}) and issuetype in (${projectWorkItemTypes.join(',')}))`);
                }
            }
            if (projectWorkItemTypeFilters.length > 0) {
                filters.push(`and (${projectWorkItemTypeFilters.join(' or ')})`);
            }
        }

        if (excludeItemsCompletedBeforeDate)
            filters.push(
                `and (resolved is EMPTY OR resolved >= ${excludeItemsCompletedBeforeDate.valueOf()})`,
            );

        // Use this for development to fetch a particular item from Jira
        // filters.push('AND issue = FLO-2307');

        const filterQuery = filters.join(' ');

        this.logger.debug(`JC:[STATE:${orgId}] filter query: ${filterQuery}`);
        return filterQuery;
    }

    /**
     * @deprecated Reuse `setQueryFilter` instead of duplicating the code in this method
     */
    private setupIdsFilter(
        filterId: number,
        projectIds: string[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        excludeItemsCompletedBeforeDate?: Date,
    ): string {
        // This is duplicated code. Same code is in extract process. Something we can improve

        const filters = [`filter=${filterId}`];

        if (excludeItemsCompletedBeforeDate)
            filters.push(
                `and (resolved is EMPTY OR resolved >= ${excludeItemsCompletedBeforeDate.valueOf()})`,
            );

        filters.push(`and project in (${projectIds.join(',')})`);

        const issueTypeIds = workItemTypeMaps.map(
            (workItemTypeMap) => workItemTypeMap.datasourceWorkItemId,
        );

        if (issueTypeIds && issueTypeIds.length) {
            const uniqueIssueTypes = [...new Set(issueTypeIds)];
            filters.push(`and issuetype in (${uniqueIssueTypes.join(',')})`);
        }

        return filters.join(' ');
    }

    private setupSort(): string {
        return ['order by updated asc'].join(',');
    }

    /**
     * The name of the Flagged/Impediment field is different
     * for different orgs. So we have to use the metadata API (/field)
     * to identify the name of the field by name
     *
     */
    private async getFlaggedFieldName(runParameters: ServiceDetails): Promise<string | undefined> {
        let serviceUrl, accessToken;
        try {
            if (!runParameters) {
                throw new Error('Could not fetch run parameters');
            }

            //add the service url so we can pass to the jira cloud api to request the statusCategory
            serviceUrl = runParameters.url;
            accessToken = runParameters.accessToken;

            if (!serviceUrl || !accessToken) {
                throw new Error('serviceUrl or accessToken is null');
            }

            const fields: Record<string, string>[] = await this.getFields(serviceUrl, accessToken);
            if (fields && fields.length) {
                const flaggedField = fields
                    .filter((f) => this.flaggedFieldsSet.has(f.name));
                if (flaggedField.length > 0) {
                    return flaggedField[0].key;
                } else {
                    // If the credentials are wrong, it doesnt return all the fields
                    this.logger.error(({
                        message: `Could not find the flagged field. Check if the Jira auth credentials are correct`,
                        fields
                    }));
                }
            } else {
                throw new Error('getFields returned undefined or empty');
            }
        } catch (e) {
            this.logger.error(({
                message: 'Error in getFlaggedFieldName',
                errorMessage: (e as Error).message,
                url: serviceUrl
            }));
            throw e;
        }
    }

    async buildURL({
        orgId,
        datasourceId,
        serviceUrl,
        settings,
        contexts,
        workItemTypeMaps,
        datasourceType,
        excludeItemsCompletedBeforeDate,
        expandChangeLog = true,
        projectIds,
        changedSince = new Date(0),
        customFieldConfigs,
        flaggedFieldName,
        startAt = 0
    }: {
        orgId: string;
        datasourceId: string;
        serviceUrl: string;
        settings: PrivateFields;
        contexts: ContextItem[];
        workItemTypeMaps: WorkItemTypeMapItem[];
        startAt: number;
        datasourceType: string;
        excludeItemsCompletedBeforeDate?: Date;
        expandChangeLog?: boolean;
        projectIds?: string[];
        changedSince?: Date;
        customFieldConfigs?: CustomFieldConfig[];
        flaggedFieldName: string | undefined;
    }) {
        const PAGE_SIZE = 50;
        const querySelect = await this.setupQuerySelect({
            orgId,
            datasourceId,
            settings,
            customFieldConfigs,
            flaggedFieldName
        });

        const jql = `${this.setupQueryFilter(
            orgId,
            contexts,
            changedSince,
            workItemTypeMaps,
            excludeItemsCompletedBeforeDate,
            projectIds,
        )} ${this.setupSort()}`;

        let fullUrl = `${serviceUrl}/search?`
            .concat(`&startAt=${startAt}`)
            .concat(`&maxResults=${PAGE_SIZE}`)
            .concat(
                `&jql=${jql}`,
            )
            .concat(`&fields=${querySelect}`);
        if (expandChangeLog) {
            fullUrl = fullUrl.concat(`&expand=${this.setupQueryExpand()}`);
        }

        return fullUrl;
    }

    async callApi(url: string, accessCredentials: string) {
        this.logger.info(({
            message: 'Calling api',
            url,
        }));
        const response = await fetch(url, {
            headers: this.setupHeaders(accessCredentials),
        });
        return response.json();
    }

    async getCount(urlString: string, accessCredentials: string): Promise<number> {
        const url = new URL(urlString);
        url.searchParams.set('maxResults', '0');
        url.searchParams.set('startAt', '0');
        const newUrl = url.toString();
        const response = await this.callApi(newUrl, accessCredentials);
        if (typeof response.total === 'number') {
            return response.total;
        } else {
            throw new Error('Response does not have a total');
        }
    }

    replaceStartAt(urlString: string, startAt: number) {
        const url = new URL(urlString);
        url.searchParams.set('startAt', startAt.toString());
        return url.toString();
    }


    /**
     * https://confluence.atlassian.com/jirakb/factors-contributing-to-jql-performance-in-jira-server-740263450.html
     * 
     * 
     * ```Using "filter IN" to amalgamate smaller views into larger team views Should be avoided.  These are effectively nested searches, so "filter IN (1, 2, 3, 4)" is not a single search; it is five complete searches that then filter the results of the first search with the results of the other four.  With multiple levels, this can get out of hand very quickly.  Finding a way to express what you want more directly and/or set up the relationship the other direction so that you are searching through single "parent" filters at each level rather than through multiple "child" filters is more efficient.```
     * 
     * 
     * Using many filters in the JQL expression is slow. So fetch data for each filter
     */
    async getDataFromFilter({
        orgId,
        datasourceId,
        serviceUrl,
        accessCredentials,
        settings,
        context,
        workItemTypeMaps,
        datasourceType,
        excludeItemsCompletedBeforeDate,
        expandChangeLog = true,
        projectIds,
        changedSince = new Date(0),
        customFieldConfigs,
        flaggedFieldName,
        batchSize
    }: {
        orgId: string;
        datasourceId: string;
        serviceUrl: string;
        accessCredentials: string;
        settings: PrivateFields;
        context: ContextItem;
        workItemTypeMaps: WorkItemTypeMapItem[];
        startAt: number;
        datasourceType: string;
        excludeItemsCompletedBeforeDate?: Date;
        expandChangeLog?: boolean;
        projectIds?: string[];
        changedSince?: Date;
        customFieldConfigs?: CustomFieldConfig[];
        flaggedFieldName: string | undefined;
        batchSize: number;
    }) {
        try {
            this.logger.info(({
                message: 'Starting data extract for filter',
                datasourceType,
                orgId,
                context,
                changedSince: changedSince.toISOString()
            }));
            let startAt = 0;
            const url = await this.buildURL({
                orgId,
                datasourceId,
                serviceUrl,
                settings,
                contexts: [context],
                workItemTypeMaps,
                datasourceType,
                excludeItemsCompletedBeforeDate,
                expandChangeLog,
                projectIds,
                changedSince,
                customFieldConfigs,
                flaggedFieldName,
                startAt
            });

            const allIssues = [];
            const totalCount = await this.getCount(url, accessCredentials);
            const count = _.min([totalCount, batchSize]);
            const startAtList = _.range(0, count, 50);
            const chunks = _.chunk(startAtList, 5);
            for (const chunk of chunks) {
                const urls = chunk.map(startAt => this.replaceStartAt(url, startAt));
                const results = await Promise.all(
                    urls.map(u => this.callApi(u, accessCredentials))
                );
                const issues = _.chain(results).map(r => r.issues).flatten().value();
                allIssues.push(...issues);
            }

            this.logger.info(({
                message: 'Finished data extract for filter',
                datasourceType,
                orgId,
                context,
                url,
                count: allIssues.length
            }));

            return allIssues;
        } catch (e) {
            this.logger.error(({
                message: 'Error fetching data for filter',
                datasourceType,
                orgId,
                errorMessage: e.message,
                errorStack: e.stack,
            }));
            throw e;
        }
    }
}
