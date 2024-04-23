/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IJCIssue } from '../data/jc_issue';
import {
    IDatasource,
    ServiceDetails,
    PrivateFields,
} from '../../data/datasource_aurora';
import { Logger } from 'pino';
import { ContextItem, IContext } from '../../data/context_aurora';
import { DateTime } from 'luxon';
import { IContextMappingNotifier } from '../../notifications/context_mapping_notifier';
import _ from 'lodash';
import { IProject, ProjectItem } from '../../data/project_aurora';
import { IWorkItemTypeMap, WorkItemTypeMapItem } from '../../data/work_item_type_aurora';
import { LogTags } from '../../utils/log_tags';
import { CONTEXT_WORKITEM_MAPPING_QUEUE, IExtractContextProcessor } from '../../process_interfaces/extract_context_process_interface';
import { ISqsClient } from '../../notifications/sqs_client';
import { v4 } from 'uuid';
import { IS3Client } from '../../workitem/s3_client';

export class JiraExtractContextProcessor implements IExtractContextProcessor {
    private orgId: string;
    private datasourceId: string;
    private logger: Logger;
    private datasource: IDatasource;
    private state: IJCIssue;
    private context: IContext;
    private contextMappingNotifier: IContextMappingNotifier;
    private project: IProject;
    private workItemTypeMap: IWorkItemTypeMap;
    private sqsClient: ISqsClient;
    private itemUploader: IS3Client;

    readonly DEMO_ORG_ID = 'flomatika-demo';
    readonly DEMO_DATASOURCE_ID = '55F599CA-98BA-4924-9B04-441678F030A6';
    readonly FLOMATIKA_ORG_ID = 'flomatika';
    readonly SNS_BATCH_SIZE = 9000;
    readonly RETRY_COUNT = 3;

    constructor(opts: {
        orgId: string;
        datasourceId: string;
        logger: Logger;
        datasource: IDatasource;
        jcState: IJCIssue;
        context: IContext;
        contextMappingNotifier: IContextMappingNotifier;
        project: IProject;
        workItemTypeMap: IWorkItemTypeMap;
        sqsClient: ISqsClient;
        itemUploader: IS3Client;
    }) {
        this.orgId = opts.orgId;
        this.datasourceId = opts.datasourceId;
        this.logger = opts.logger;
        this.datasource = opts.datasource;
        this.state = opts.jcState;
        this.context = opts.context;
        this.contextMappingNotifier = opts.contextMappingNotifier;
        this.project = opts.project;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.sqsClient = opts.sqsClient;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
        });
        this.itemUploader = opts.itemUploader;
    }

    async getContexts(
        overrideOrgId?: string,
        overrideDatasourceId?: string,
    ): Promise<Array<ContextItem>> {
        const contexts = (
            await this.context.getContextsForOrgDataSource(
                overrideOrgId ?? this.orgId,
                overrideDatasourceId ?? this.datasourceId,
            )
        ).filter(
            (context) =>
                context.contextAddress &&
                !isNaN(Number.parseInt(context.contextAddress)),
        );
        return contexts;
    }

    async getProjects(
    ): Promise<Array<ProjectItem>> {
        const projects = await this.project.getAllProjects(
            this.orgId,
            this.datasourceId,
        );
        return projects;
    }

    async getWorkItemTypeConfigs(): Promise<WorkItemTypeMapItem[]> {
        const workItemTypeMaps = await this.workItemTypeMap.getWorkItemTypeMaps(
            this.orgId,
            this.datasourceId,
        );
        return workItemTypeMaps;
    }

    async getRunParameters(): Promise<ServiceDetails | undefined> {
        const runParameters = await this.datasource.getServiceDetails(
            this.orgId,
            this.datasourceId,
        );
        if (!runParameters)
            throw new Error('I could not find any datasource parameters');
        return runParameters;
    }

    async getSettings(): Promise<PrivateFields> {
        return await this.datasource.getSettings(this.orgId);
    }

    async extractContextWorkItemMaps(contextId: string) {
        const runParameters = await this.getRunParameters();
        if (!runParameters) {
            return;
        }

        const allContexts = await this.getContexts();
        const contexts = allContexts.filter(c => c.id === contextId);
        const projects = await this.getProjects();
        const workItemTypeMaps = await this.getWorkItemTypeConfigs();
        const extractRunAt = DateTime.utc();
        let countOfItemIds = 0;

        const retrySet = new Set<string>();
        const debuggingId = v4();

        // Defining a function here to make the change quickly
        // Had to do this change to do the extract in parallel to reduce the running time
        const processContext = async (context: ContextItem) => {
            this.logger.info(({
                message: 'Starting extract for context',
                context,
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING]
            }));
            try {
                /**
                 * Items in the context
                 */
                const allItemIds = await this.state.getIdsFromFilter(
                    this.orgId,
                    runParameters.url!,
                    runParameters.accessToken!,
                    context,
                    projects.map(p => p.projectId),
                    workItemTypeMaps,
                    runParameters.excludeItemsCompletedBeforeDate
                        ? new Date(runParameters.excludeItemsCompletedBeforeDate)
                        : undefined,
                );

                this.logger.info(({
                    message: 'Fetched work item ids from context',
                    context,
                    count: allItemIds.length,
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    tags: [LogTags.CONTEXT_WORKITEM_MAPPING]
                }));

                countOfItemIds = countOfItemIds + allItemIds.length;

                // Queue sprint to the queue for sprint-work item mapping
                const s3UploadResult = await this.itemUploader.uploadWorkItemArray(allItemIds, context.id, this.orgId, this.datasourceId);
                await this.sqsClient.sendMessageToQueue(
                    CONTEXT_WORKITEM_MAPPING_QUEUE,
                    {
                        orgId: this.orgId,
                        datasourceId: this.datasourceId,
                        contextId: context.id,
                        workItemIdKey: s3UploadResult,
                        extractRunAt: extractRunAt.toISO()
                    }
                );

                this.logger.info(({
                    message: 'Queued items for context work item mapping',
                    context,
                    count: allItemIds.length,
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    tags: [LogTags.CONTEXT_WORKITEM_MAPPING]
                }));

                // Populate demo data
                if (this.orgId === this.FLOMATIKA_ORG_ID) {
                    const demoContexts = await this.getContexts(this.DEMO_ORG_ID, this.DEMO_DATASOURCE_ID);

                    /*
                    * The old implementation mapped a workitem to all the contexts
                    * in the demo org. So every context in the demo org ended up with 
                    * the same work items. We dont want that
                
                    * The workitem-context mapping in flomatika demo should be same as real-flomatika
                
                    * This code assumes that the board config in the wizard is configured to have
                    * the same position hierarcy as real-flomatika. If the position hierarcy is changed,
                    * it will break the mapping in flomatika-demo 
                    * */

                    const demoBoard = demoContexts.find(dc => (
                        dc.contextAddress === context.contextAddress &&
                        dc.positionInHierarchy === context.positionInHierarchy
                    ));

                    if (demoBoard) {
                        await this.mapDemoContexts(
                            allItemIds,
                            [demoBoard]
                        );
                    }
                }
                // If retry successful, remove from map
                retrySet.delete(context.id);
            } catch (e) {
                this.logger.warn(({
                    message: 'Error extracting work item ids from context',
                    context,
                    orgId: this.orgId,
                    errorMessage: (e as Error).message,
                    errorStack: (e as Error).stack,
                }));

                retrySet.add(context.id);

                console.log("🚀 ~ file: extract_context_processor.ts:226 ~ JiraExtractContextProcessor ~ processContext ~ retryMap:", retrySet);
                this.logger.info(({
                    message: 'retrySet in catch',
                    orgId: this.orgId,
                    retrySet: Array.from(retrySet),
                    size: retrySet.size,
                    debuggingId
                }));
            }
        };

        const chunks = _.chunk(contexts, 5);
        for (const chunk of chunks) {
            const promises = chunk.map(c => processContext(c));
            await Promise.all(promises);
        }

        this.logger.info(({
            message: 'retrySet',
            orgId: this.orgId,
            retrySet: Array.from(retrySet),
            size: retrySet.size,
            debuggingId
        }));

        let i = 0;
        while (i < this.RETRY_COUNT) {
            console.log("🚀 ~ file: extract_context_processor.ts:243 ~ JiraExtractContextProcessor ~ extractContextWorkItemMaps ~ ids:", retrySet);
            this.logger.info(({
                message: 'retrySet in loop',
                orgId: this.orgId,
                retrySet: Array.from(retrySet),
                size: retrySet.size,
                debuggingId
            }));
            const filtered = contexts.filter(({ id }) => retrySet.has(id));
            console.log("🚀 ~ file: extract_context_processor.ts:245 ~ JiraExtractContextProcessor ~ extractContextWorkItemMaps ~ filtered:", filtered);

            this.logger.info(({
                message: 'filtered in loop',
                orgId: this.orgId,
                retrySet: Array.from(retrySet),
                size: retrySet.size,
                debuggingId,
                filtered
            }));
            for (const context of filtered) {
                this.logger.info(({
                    message: 'Retrying extract context',
                    context,
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
                    retryCount: i
                }));
                await processContext(context);
            }
            i++;
        }


        if (retrySet.size > 0) {
            this.logger.error(({
                message: 'Failed after retry',
                failedItems: Array.from(retrySet),
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING]
            }));
        }

        this.logger.info(({
            message: 'Finished extracting work item ids from contexts',
            contextCount: contexts.length,
            workItemIdsCount: countOfItemIds,
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.CONTEXT_WORKITEM_MAPPING]
        }));
    }



    async mapDemoContexts(
        workItemIds: Array<string>,
        contexts: Array<ContextItem>,
    ) {
        const runParameters = await this.getRunParameters();
        if (!runParameters) {
            return;
        }

        const extractRunAt = DateTime.utc();

        let countOfItemIds = 0;
        for (const context of contexts) {
            //jira issue id's
            countOfItemIds = countOfItemIds + workItemIds.length;

            // Queue sprint to the queue for sprint-work item mapping
            const s3UploadResult = await this.itemUploader.uploadWorkItemArray(workItemIds, context.id, this.orgId, this.datasourceId);
            await this.sqsClient.sendMessageToQueue(
                CONTEXT_WORKITEM_MAPPING_QUEUE,
                {
                    orgId: this.DEMO_ORG_ID,
                    datasourceId: this.DEMO_DATASOURCE_ID,
                    contextId: context.id,
                    // workItemIds,
                    workItemIdKey: s3UploadResult,
                    extractRunAt: extractRunAt.toISO()
                }
            );


        }

        this.logger.info({
            message: 'Finished mapping ids for context for demo data',
            contextsCount: contexts.length,
            itemCount: countOfItemIds,
        });

        return contexts;
    }
}
