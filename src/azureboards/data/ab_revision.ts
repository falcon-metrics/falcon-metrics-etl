/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _ from 'lodash';
import { Logger } from 'pino';
import { o } from 'odata';
import { AZURE_BLOCKED_FIELD_TAG, BLOCKED_REASON_TAG, DISCARDED_REASON_TAG, ICustomFieldConfigs } from '../../data/custom_fields_config';
import { PrivateFields } from '../../data/datasource_aurora';
import { IFieldMap } from '../../data/field_map_aurora';
import { RevisionTypes } from '../../jiracloud/process/revision_processor';
import { IResponseLogger } from '../process/ab_response_logger';
import { ExtraConfigs, IABQuery } from './ab_query';
import { getAssigneeChangeRevisions, getBlockedRevisions, getCustomFieldRevisions, getStateChangeRevisions } from './revision_utils';
import path from 'path';
import axios from 'axios';

export interface IABRevision {
    getWorkItemRevisionsForWorkflowEvents(
        orgId: string,
        datasourceId: string,
        projectUrl: string,
        baseUrl: string,
        accessToken: string,
        workItemIds: Array<string>,
        projectId: string,
        privateFields?: PrivateFields,
    ): Promise<Array<any>>;
}

export class ABRevision implements IABRevision {
    private logger: Logger;
    private fieldMap: IFieldMap;
    private responseLogger: IResponseLogger;
    private abQuery: IABQuery;
    private customFieldConfig: ICustomFieldConfigs;


    constructor(opts: {
        logger: Logger;
        fieldMap: IFieldMap;
        responseLogger: IResponseLogger;
        abQuery: IABQuery;
        customFieldConfig: ICustomFieldConfigs;
    }) {
        this.logger = opts.logger;
        this.fieldMap = opts.fieldMap;
        this.responseLogger = opts.responseLogger;
        this.abQuery = opts.abQuery;
        this.customFieldConfig = opts.customFieldConfig;
        this.logger = opts.logger;
    }

    /**
     * Returns an array with arrays of the given size.
     *
     * @param myArray {Array} Array to split
     * @param chunkSize {Integer} Size of every group
     */
    chunkArray(myArray: Array<any>, chunk_size: number): Array<any> {
        const results: Array<any> = [];

        while (myArray.length) {
            results.push(myArray.splice(0, chunk_size));
        }

        return results;
    }

    //Retrieves the work item revisions from Azure Boards during extraction of 'state items'
    //for the purpose of identifying the workflow event dates (Arrival, Commitment, Departure)
    //This method receives a collection of WorkItemIds the caller is interested on
    //TODO: Refactor the code to send these revisions to AB StateTranslationProcessor
    async getWorkItemRevisionsForWorkflowEvents(
        orgId: string,
        datasourceId: string,
        projectUrl: string,
        baseUrl: string,
        accessToken: string,
        workItemIds: Array<string>,
        projectId: string,
        privateFields?: PrivateFields,
    ): Promise<Array<any>> {
        //Breaks the collection of workItemIds into batches, because they are sent explicitly on the queryString to Azure Boards.
        //There's a limit of characters to the queryString so we break into batches and make multiple calls and concat the results into one result array

        // When the request to Azure API is too long, the API returns 404 instead of returning an error message
        // And, 404 response can come only when you make the request with an encoded URL, but with a decoded
        // URL, you may get a response. This happened in the case of this item. (See the Jira item for this commit)

        const workItemIdBatches = this.chunkArray(workItemIds, 500);
        let allResults: Array<any> = [];

        const select = await this.setupQuerySelect(
            orgId,
            datasourceId,
            projectId,
            undefined,
            privateFields
        );

        try {
            let batchIndex = 0;
            for (const workItemBatch of workItemIdBatches) {
                const url = await this.buildQueryToFetchRevisions(
                    projectUrl,
                    workItemBatch,
                    select,
                );
                const body = this.buildBatchQueryBody(url);
                const { revisions, nextLink, count } = await this.odataBatchQuery(body, accessToken, baseUrl);
                allResults.push(...revisions);

                if (nextLink !== undefined) {
                    let pages = 0;
                    // Fallback to prevent infinite loop
                    const LOOP_LIMIT = 20;
                    while (pages < LOOP_LIMIT) {
                        console.log("fetching page ", pages + 1);
                        const body = this.buildBatchQueryBody(url);
                        const { revisions, nextLink, count } = await this.odataBatchQuery(body, accessToken, baseUrl);
                        allResults.push(...revisions);
                        if (nextLink === undefined) break;
                        pages += 1;
                        if (pages === LOOP_LIMIT) {
                            console.error('Loop till the limit. Breaking loop');
                            break;
                        }
                    }
                }

                batchIndex += 1;


                // const filter = this.setupQueryFilterForItems(workItemBatch);

                // //Pass the parameter fragment: '', because otherwise the library will return only the property 'value' from the JSON
                // const handler = o(serviceUrl!, {
                //     headers: this.abQuery.setupHeaders(accessToken!),
                //     fragment: '',
                //     referrer: undefined
                // });
                // handler.get('WorkItemRevisions');

                // const query = {
                //     $select: await this.setupQuerySelect(
                //         orgId,
                //         datasourceId,
                //         projectId,
                //         undefined,
                //         privateFields
                //     ),
                //     $expand: 'Project($Select=ProjectId,ProjectName),AssignedTo($select=UserName)',
                //     $filter: filter,
                //     $orderby: 'revision asc',
                // };


                // //Fetch data from AzureBoards
                // const result = await handler.batch(query);
                // console.log("🚀 ~ file: ab_revision.ts:111 ~ ABRevision ~ result:", result);

                // //Log any warnings or errors coming from Azure Boards

                // if ('value' in result) {
                //     allResults = allResults.concat(result['value']);
                // }

                // let nextPageLink = undefined;
                // if ('@odata.nextLink' in result) {
                //     nextPageLink = result['@odata.nextLink'];
                // }

                // let hasMorePages = nextPageLink ? true : false;

                // while (hasMorePages) {
                //     const pageResults: any = await this.abQuery.getNextPage(
                //         nextPageLink,
                //         accessToken,
                //     );

                //     //Log any warnings or errors coming from Azure Boards

                //     if ('value' in pageResults) {
                //         allResults = allResults.concat(pageResults['value']);
                //     }

                //     nextPageLink = undefined;
                //     if ('@odata.nextLink' in pageResults) {
                //         nextPageLink = pageResults['@odata.nextLink'];
                //     }

                //     hasMorePages = nextPageLink ? true : false;
                // }
            }

            const stateChangeRevisions =
                getStateChangeRevisions(allResults)
                    .map(r => ({ ...r, type: RevisionTypes.STATE_CHANGE }));

            const assigneeChangeRevisions = getAssigneeChangeRevisions(allResults)
                .map(r => ({ ...r, type: RevisionTypes.ASSIGNEE_CHANGE }));


            const blockedFieldName = await this.customFieldConfig.getCustomFieldByTag(orgId, datasourceId, AZURE_BLOCKED_FIELD_TAG);
            const blockedReasonFieldName = await this.customFieldConfig.getCustomFieldByTag(orgId, datasourceId, BLOCKED_REASON_TAG);
            const discardedReasonFieldName = await this.customFieldConfig.getCustomFieldByTag(orgId, datasourceId, DISCARDED_REASON_TAG);

            let blockedRevisions = [];
            if (blockedFieldName) {
                blockedRevisions = getBlockedRevisions(allResults, blockedFieldName)
                    .map(r => ({ ...r, type: RevisionTypes.FLAGGED }));
            }

            let blockedReasonRevisions = [];
            if (blockedReasonFieldName) {
                blockedReasonRevisions =
                    getCustomFieldRevisions(allResults, blockedReasonFieldName)
                        .map(r => ({
                            ...r,
                            type: RevisionTypes.BLOCKED_REASON,
                            blockedReason: r[blockedReasonFieldName]
                        }));
            }

            let discardedReasonRevisions = [];
            if (discardedReasonFieldName) {
                discardedReasonRevisions = getCustomFieldRevisions(allResults, discardedReasonFieldName)
                    .map(r => ({
                        ...r,
                        type: RevisionTypes.DISCARDED_REASON,
                        discardedReason: r[discardedReasonFieldName]
                    }));
            }

            return [
                ...stateChangeRevisions,
                ...assigneeChangeRevisions,
                ...blockedRevisions,
                ...blockedReasonRevisions,
                ...discardedReasonRevisions
            ];
        } catch (e) {
            this.logger.error(({
                message: 'Error fetching work item revisions',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                orgId,
                projectId,
                url: projectUrl,
                fullError: e
            }));
            throw e;
        }
    }

    /**
     * @deprecated
     * 
     * Use formatCustomFieldName
     */
    private async setupQuerySelectForItems(
        orgId: string,
        datasourceId: string,
        privateFieldSetting?: PrivateFields,
    ): Promise<string> {
        const fieldList = await this.fieldMap.getAllDatasourceFieldNamesForOrg(
            orgId,
            datasourceId,
        );
        const privateFields = [];
        if (privateFieldSetting?.ingestTitle) {
            privateFields.push('Title');
        }
        return [
            'WorkItemId',
            'WorkItemType',
            'ChangedDate',
            'State',
            'StateCategory',
            'Area',
            'CreatedDate',
            'Revision',
            'ClosedDate',
            'Reason',
        ]
            .concat(fieldList)
            .concat(privateFields)
            .join(',');
    }


    /**
     * Copied from ab_query
     */
    private formatCustomFieldName(name: string): string {
        //For analytics api, the "." separator of field name must be replace with "_", wtf
        let validName = name.replace('.', '_');
        validName = validName.split('-').join('__002D'); // an easier replace all https://stackoverflow.com/questions/43310947/replace-all-instances-of-character-in-string-in-typescript
        return validName;
    }

    /**
     * Copied from ab_query
     */
    async setupQuerySelect(
        orgId: string,
        datasourceId: string,
        projectId?: string,
        extraConfigs?: ExtraConfigs,
        privateFieldSetting?: PrivateFields,
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

    private setupQueryFilterForItems(workItemIds: Array<string>): string {
        const filters = [`WorkItemId in (${workItemIds.join(',')})`];

        return filters.join(' ');
    }

    /**
     * https://learn.microsoft.com/en-us/azure/devops/report/extend-analytics/odata-batch?view=azure-devops
     * 
     *
     * Build the body for the batch request. The batch_ID here should match the ID in the header
     */
    buildBatchQueryBody(url: URL) {
        return (
            `--batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d
Content-Type: application/http
Content-Transfer-Encoding: binary

GET ${url.toString()} HTTP/1.1
Accept: application/json

--batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d`
        );
    };

    async buildQueryToFetchRevisions(
        serviceUrl: string,
        workItemIds: Array<string>,
        select: string,
    ) {
        const filter = this.setupQueryFilterForItems(workItemIds);
        const query = {
            $select: select,
            $expand: 'Project($Select=ProjectId,ProjectName),AssignedTo($select=UserName)',
            $filter: filter,
            $orderby: 'revision asc',
            $count: true
        };
        const url = new URL('WorkItemRevisions', serviceUrl);
        Object
            .entries(query)
            .forEach(([key, value]) => {
                url.searchParams.append(key, value.toString());
            });

        return url;
    }

    setupBatchHeaders(accessToken: string) {
        // Name doesnt matter. can be anything
        const buf = Buffer.from('name:'.concat(accessToken));
        return {
            'Content-Type': 'multipart/mixed; boundary=batch_335b8c20-e4a2-4beb-b73f-99089ed3f72d',
            'Authorization': 'Basic '.concat(buf.toString('base64')),
        };
    };

    async odataBatchQuery(body: string, accessToken: string, serviceUrl: string): Promise<{
        revisions: any[], nextLink?: string; count?: boolean;
    }> {
        try {
            const url = new URL(path.join(serviceUrl, '_odata/v2.0/$batch'));
            this.logger.info(({
                message: 'Batch request params - for revisions',
                serviceUrl,
                url,
                body,
                headers: this.setupBatchHeaders(accessToken)
            }));
            const response = await axios.post(
                url.toString(),
                body,
                {
                    headers: this.setupBatchHeaders(accessToken)
                }
            );
            return {
                revisions: response.data?.responses[0]?.body?.value ?? [],
                nextLink: response.data?.responses[0]?.body['@odata.nextLink'],
                count: response.data?.responses[0]?.body.count,
            };
        } catch (e) {
            let responseText, httpCode;
            if (e instanceof Response) {
                responseText = await e.text();
                httpCode = e.status;
            }
            this.logger.error({
                message: 'Error in odataBatchQuery',
                errorMessage: e.message,
                errorStack: e.stack,
                responseText,
                httpCode
            });
            throw e;
        }
    }
}
