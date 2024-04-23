/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IJCIssue } from '../data/jc_issue';
import { IJCStatus } from '../data/jc_status';
import {
    IDatasource,
    ServiceDetails,
    PrivateFields,
} from '../../data/datasource_aurora';
import { Logger } from 'pino';
import { ContextItem, IContext } from '../../data/context_aurora';
import { DateTime } from 'luxon';
import {
    IWorkItemTypeMap,
    WorkItemTypeMapItem,
} from '../../data/work_item_type_aurora';
import { IProject, ProjectItem } from '../../data/project_aurora';
import { IS3Client } from '../../workitem/s3_client';
import {
    BatchSizeDirection,
    RateLimitError,
} from '../../common/types_and_constants';
import {
    changeBatchSize,
    handleRateLimit,
    isTimeToQuit,
} from '../../common/extract_utils';
import { ISqsClient, QueueType } from '../../notifications/sqs_client';
import { IExtractStateProcessor } from '../../process_interfaces/extract_states_process_interface';
import { SQS } from 'aws-sdk';
import {
    CustomFieldConfig,
    ICustomFieldConfigs,
} from '../../data/custom_fields_config';
import { RawItem } from '../../process_interfaces/revision_process_interface';
import { isDev } from '../../utils/dev';
import _ from 'lodash';
import { LogTags } from '../../utils/log_tags';

export class JiraExtractProcessor implements IExtractStateProcessor {
    private orgId: string;
    private datasourceId: string;
    private datasourceType: string;
    private logger: Logger;
    private datasource: IDatasource;
    private state: IJCIssue;
    private context: IContext;
    private workItemTypeMap: IWorkItemTypeMap;
    private project: IProject;
    private itemUploader: IS3Client;
    private sqsClient: ISqsClient;
    private customFieldConfig: ICustomFieldConfigs;
    readonly DEMO_ORG_ID = 'flomatika-demo';
    readonly DEMO_DATASOURCE_ID = '55F599CA-98BA-4924-9B04-441678F030A6';
    readonly FLOMATIKA_ORG_ID = 'flomatika';

    constructor(opts: {
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        logger: Logger;
        datasource: IDatasource;
        jcState: IJCIssue;
        jcStatus: IJCStatus;
        context: IContext;
        workItemTypeMap: IWorkItemTypeMap;
        project: IProject;
        itemUploader: IS3Client;
        sqsClient: ISqsClient;
        customFieldConfig: ICustomFieldConfigs;
    }) {
        this.orgId = opts.orgId;
        this.datasourceId = opts.datasourceId;
        this.datasourceType = opts.datasourceType;
        this.logger = opts.logger;
        this.datasource = opts.datasource;
        this.state = opts.jcState;
        this.context = opts.context;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.project = opts.project;
        this.itemUploader = opts.itemUploader;
        this.sqsClient = opts.sqsClient;
        this.customFieldConfig = opts.customFieldConfig;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.EXTRACT],
        });
    }
    isExtractDue(runParameters: ServiceDetails): boolean {
        // If development, always run the extract
        if (isDev) return true;

        if (!runParameters.isStateExtractDue) {
            this.logger.info({
                message: `too soon to run the State extract, exiting`,
            });
            return false;
        }
        return true;
    }
    async getContextConfigs(): Promise<Array<ContextItem>> {
        const result = await this.context.getContextsForOrgDataSource(
            this.orgId,
            this.datasourceId,
        );
        const contexts = _
            .chain(result)
            .filter(
                context => (
                    typeof context.contextAddress === 'string' &&
                    !isNaN(Number.parseInt(context.contextAddress))
                )
            )
            .sortBy(context => context.name)
            .value();
        return contexts;
    }
    async getCustomFieldConfigs(): Promise<CustomFieldConfig[]> {
        return await this.customFieldConfig.getCustomFieldConfigs(
            this.orgId,
            this.datasourceId,
        );
    }
    async getProjectConfigs(): Promise<ProjectItem[]> {
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
    async getRunParameters(): Promise<ServiceDetails> {
        const runParameters = await this.datasource.getServiceDetails(
            this.orgId,
            this.datasourceId,
        );
        if (!runParameters)
            throw new Error('I could not find any datasource parameters');

        return runParameters;
    }
    getLinkedItemsConfigs(): any {
        ////For jira, it is getting linked items regardless in jc_issue
    }
    async getPrivateFieldsConfigs(): Promise<PrivateFields> {
        let privateFields = await this.datasource.getSettings(this.orgId);
        if (!privateFields) {
            privateFields = {
                ingestAssignee: false,
                ingestTitle: false,
                orgId: this.orgId,
            };
        }
        return privateFields;
    }
    async getWorkItemsFromDatasource(
        contextConfigs: ContextItem[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        projects: ProjectItem[],
        runParameters: ServiceDetails,
        privateFieldsConfigs: PrivateFields,
        runDate: string,
        customFieldConfigs: CustomFieldConfig[],
    ): Promise<Record<any, any>[]> {
        const projectIds = projects.map((project) => project.projectId);
        const EXPAND_CHANGELOG = true;
        const batchSizeRemainder = runParameters.batchSizeStateItems
            ? runParameters.batchSizeStateItems
            : 100;
        try {
            const startTimeInMillis = DateTime.fromISO(runDate).toMillis();
            const items = await this.state.getWorkItemsFromDatasource(
                this.orgId,
                this.datasourceId,
                runParameters,
                startTimeInMillis,
                contextConfigs,
                workItemTypeMaps,
                privateFieldsConfigs,
                batchSizeRemainder,
                EXPAND_CHANGELOG,
                projectIds,
                customFieldConfigs,
            );
            return items;
        } catch (error: any) {
            if ((error as RateLimitError).rateLimited) {
                await handleRateLimit(
                    this.orgId,
                    this.datasourceId,
                    runDate,
                    runParameters,
                    error.retryDateString,
                    this.datasource,
                );
                await changeBatchSize(
                    this.orgId,
                    this.datasourceId,
                    BatchSizeDirection.DECREASE,
                    runParameters.batchSizeStateItems!,
                    this.datasource,
                );
            } else {
                throw error;
            }

            return [];
        }
    }
    sortWorkItem(items: any[]): any[] {
        const itemsOrderedByDateAsc = [...items].sort((a, b) => {
            const changedDateA = DateTime.fromISO(a.fields.updated).toUTC();
            const changedDateB = DateTime.fromISO(b.fields.updated).toUTC();

            return changedDateA.toMillis() - changedDateB.toMillis();
        });
        return itemsOrderedByDateAsc;
    }
    async updateStateLastRun(
        runDate: string,
        lastChangeDate: string,
    ): Promise<void> {
        await this.datasource.updateStateLastRun(
            this.orgId,
            this.datasourceId,
            runDate,
            lastChangeDate,
        );
    }
    async uploadWorkItemToS3(item: RawItem): Promise<string> {
        return await this.itemUploader.uploadItem(item);
    }
    async sendSQSMessage(itemKey: string): Promise<SQS.SendMessageResult> {
        return await this.sqsClient.sendMessageToQueueByDatasourceType(
            QueueType.PROCESS_REVISIONS,
            itemKey,
        );
    }
    async increaseBatchSizeWhenExtractFinished(
        countItemsUploadToS3: number,
        batchSize: number,
    ): Promise<void> {
        if (!(countItemsUploadToS3 < batchSize)) {
            //Meaning the time is sufficient for upload all the items
            this.logger.info({
                message: `did not break time out, increasing batch size`,
            });
            await changeBatchSize(
                this.orgId,
                this.datasourceId,
                BatchSizeDirection.INCREASE,
                batchSize,
                this.datasource,
            );
        }
    }
    async checkIsTimeToQuit(
        startTimeMillis: number,
        runParameters: ServiceDetails,
    ): Promise<boolean> {
        if (isTimeToQuit(startTimeMillis, runParameters.runDelayInMinutes)) {
            console.log(
                `JC: [STATE:${this.orgId}][${this.datasourceId}] break from time out, reducing batch size`,
            );
            //reduce the batchSize
            await changeBatchSize(
                this.orgId,
                this.datasourceId,
                BatchSizeDirection.DECREASE,
                runParameters.batchSizeStateItems!,
                this.datasource,
            );
            return true;
        }
        return false;
    }
    async setupEpicLink(): Promise<CustomFieldConfig | undefined> {
        const runParameters = await this.getRunParameters();
        if (!runParameters) {
            return;
        }

        //add the service url so we can pass to the jira cloud api to request the statusCategory
        const serviceUrl = runParameters.url;
        const accessToken = runParameters.accessToken;

        if (!serviceUrl || !accessToken) {
            return;
        }

        const fields = await this.state.getFields(serviceUrl, accessToken);
        if (fields && fields.length) {
            const epicLinkField = fields.find((f) => f.name === 'Epic Link');
            if (!epicLinkField || !epicLinkField.id) {
                return;
            }
            const epicLinkId = epicLinkField.id;

            const epicLinkConfig = {
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                datasourceFieldName: epicLinkId,
                displayName: 'Epic',
                type: 'epic',
                enabled: true,
                hidden: true,
            };
            await this.customFieldConfig.saveCustomFieldConfig(epicLinkConfig);

            this.logger.info({
                message: `saved epic link`,
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                epicLinkConfig
            });

            return epicLinkConfig;
        } else {
            return;
        }
    }

    async queueItemForTransformation(rawItem: RawItem) {
        const itemKey = await this.uploadWorkItemToS3(rawItem);
        if (itemKey) {
            const sqsResult = await this.sendSQSMessage(itemKey);
            if (sqsResult) {


                this.logger.info(({
                    message: `Queued items to SQS`,
                    datasourceType: this.datasourceType,
                    orgId: this.orgId,
                    workItemId: rawItem.flomatikaFields.workItemId,
                    itemKey,
                    sqsResult,
                }));
            }
        }
    }

    async extractState(startTimeMillis: number): Promise<void> {
        const runParameters = await this.getRunParameters();
        if (!this.isExtractDue(runParameters!)) {
            return;
        }

        console.log(
            `startedAt: ${startTimeMillis}, runDelay: ${runParameters.runDelayInMinutes}`,
        );

        const privateFields = await this.getPrivateFieldsConfigs();
        const runDate = DateTime.utc().toISO();
        //add the service url so we can pass to the jira cloud api to request the statusCategory
        this.logger.info({
            message: 'Started extract of state items',
            runDate: runDate.toString()
        });

        const contexts = await this.getContextConfigs();

        let lastChangedDate = runParameters.nextRunStartFrom
            ? new Date(runParameters.nextRunStartFrom)
            : new Date(0);

        const workItemTypeMaps = await this.getWorkItemTypeConfigs();
        const projects = await this.getProjectConfigs();
        //setup epic link
        const epicLinkCustomFieldConfigs =
            await this.customFieldConfig.getByType(
                this.orgId,
                this.datasourceId,
                'epic',
            );

        let epicLinkCustomFieldId: string | undefined;

        if (epicLinkCustomFieldConfigs && epicLinkCustomFieldConfigs.length) {
            epicLinkCustomFieldId =
                epicLinkCustomFieldConfigs[0].datasourceFieldName;
        } else {
            const epicLinkConfig = await this.setupEpicLink();
            if (epicLinkConfig) {
                epicLinkCustomFieldId = epicLinkConfig.datasourceFieldName;
            }
        }
        if (!epicLinkCustomFieldId) {
            this.logger.info({
                message: `Unable to find Epic Link for orgId: ${this.orgId}, datasourceId: ${this.datasourceId}`,
            });
        }
        const customFieldConfigs = await this.getCustomFieldConfigs();
        const items = await this.getWorkItemsFromDatasource(
            contexts,
            workItemTypeMaps,
            projects,
            runParameters,
            privateFields,
            runDate,
            customFieldConfigs,
        );

        //we need to process items in date order so that if we don't get through them all,
        //the next schedule will pick them up from where we left off
        const itemsOrderedByDateAsc = this.sortWorkItem(items);

        let countItemsUploadToS3 = 0;
        let lastItemUpdatedDate = new Date();
        const uniqueItems: Set<string> = new Set();
        for (const jcItem of itemsOrderedByDateAsc) {
            const rawItem: RawItem = {
                ...jcItem,
                flomatikaFields: {
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    datasourceType: this.datasourceType,
                    extractTime: runDate,
                    workItemId: jcItem.key,
                    excludeBeforeDate: runParameters.excludeItemsCompletedBeforeDate,
                },
            };
            try {
                await this.queueItemForTransformation(rawItem);

                if (this.orgId === this.FLOMATIKA_ORG_ID) {
                    const demoItem = _.clone(rawItem);
                    demoItem.flomatikaFields.orgId = this.DEMO_ORG_ID;
                    demoItem.flomatikaFields.datasourceId = this.DEMO_DATASOURCE_ID;
                    await this.queueItemForTransformation(demoItem);
                    this.logger.info(({
                        message: 'Uploaded and queued demo item for transformation',
                        orgId: this.DEMO_ORG_ID,
                        datasourceId: this.DEMO_DATASOURCE_ID,
                        tags: [LogTags.EXTRACT, LogTags.DEMO_DATA]
                    }));
                }

                countItemsUploadToS3 += 1;
                uniqueItems.add(rawItem.flomatikaFields.workItemId);
                lastItemUpdatedDate = new Date(jcItem.fields.updated);
            } catch (error: any) {
                this.logger.error({
                    message: `Error in extract state. Reingest this context to make sure all items from this contexts are ingested`,
                    errorMessage: error.message,
                    errorStack: error.stack,
                    item: jcItem,
                    context: jcItem.context,
                });
                continue;
            }
        }

        const extractedContexts = _
            .chain(items)
            // Only the extract from jira-server has the context object
            .map((item: { context?: ContextItem; }) => item.context)
            .filter(context => context !== undefined)
            .filter(context => typeof context?.id === 'string')
            .uniqBy(context => context.id)
            .value();

        if (extractedContexts.length > 0) {
            this.logger.info({
                message: 'Marking contexts as ingested',
                extractedContexts,
            });
        }

        await Promise.all(extractedContexts.map(c => c.markContextAsIngested?.()));

        const wasTimeToQuit = await this.checkIsTimeToQuit(startTimeMillis, runParameters);
        if (!wasTimeToQuit) {
            await this.increaseBatchSizeWhenExtractFinished(
                countItemsUploadToS3,
                runParameters.batchSizeStateItems!,
            );
        }

        this.logger.info({
            message: 'Extracted items',
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            count: uniqueItems.size
        });

        const updatedDate =
            countItemsUploadToS3 > 0 ? lastItemUpdatedDate : lastChangedDate;

        lastChangedDate =
            updatedDate > lastChangedDate ? updatedDate : lastChangedDate;
        await this.updateStateLastRun(runDate, lastChangedDate.toISOString());

        this.logger.info({
            message: 'Updated last run date',
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            lastChangedDate: lastChangedDate.toISOString()
        });
    }
}
