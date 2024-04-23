/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IABWorkItem } from '../data/ab_work_item';
import { IABRevision } from '../data/ab_revision';
import {
    IDatasource,
    PrivateFields,
    ServiceDetails,
} from '../../data/datasource_aurora';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { ContextItem, IContext } from '../../data/context_aurora';
import { IContextMappingNotifier } from '../../notifications/context_mapping_notifier';
import {
    IWorkItemTypeMap,
    WorkItemTypeMapItem,
} from '../../data/work_item_type_aurora';
import { IProject, ProjectItem } from '../../data/project_aurora';
import { IEventDateExtractor } from '../../configuration/event_date_extractor';
import { IResponseLogger } from './ab_response_logger';
import { ABEntityType, ExtraConfigs, IABQuery } from '../data/ab_query';
import { IAbConfig } from '../data/ab_config';
import { IS3Client } from '../../workitem/s3_client';
import { changeBatchSize, isTimeToQuit, sleep } from '../../common/extract_utils';
import { BatchSizeDirection } from '../../common/types_and_constants';
import { ISqsClient, QueueType } from '../../notifications/sqs_client';
import { IExtractStateProcessor } from '../../process_interfaces/extract_states_process_interface';
import { RawItem } from '../../process_interfaces/revision_process_interface';
import {
    CustomFieldConfig,
    ICustomFieldConfigs,
} from '../../data/custom_fields_config';
import { SQS } from 'aws-sdk';
import { QueryTypes, Sequelize } from 'sequelize';
import _ from 'lodash';
import { LogTags } from '../../utils/log_tags';

export class AdoExtractProcessor implements IExtractStateProcessor {
    private orgId: string;
    private datasourceId: string;
    private datasourceType: string;
    private logger: Logger;
    private datasource: IDatasource;
    private state: IABWorkItem;
    private revision: IABRevision;
    private project: IProject;
    private abQuery: IABQuery;
    private abConfig: IAbConfig;
    private database: Sequelize;
    private itemUploader: IS3Client;
    private workItemTypeMap: IWorkItemTypeMap;
    private sqsClient: ISqsClient;
    private context: IContext;
    private customFieldConfig: ICustomFieldConfigs;
    constructor(opts: {
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        logger: Logger;
        datasource: IDatasource;
        abState: IABWorkItem;
        abRevision: IABRevision;
        context: IContext;
        contextMappingNotifier: IContextMappingNotifier;
        workItemTypeMap: IWorkItemTypeMap;
        project: IProject;
        eventDateExtractor: IEventDateExtractor;
        responseLogger: IResponseLogger;
        abQuery: IABQuery;
        abConfig: IAbConfig;
        database: any;
        itemUploader: IS3Client;
        sqsClient: ISqsClient;
        customFieldConfig: ICustomFieldConfigs;
    }) {
        this.orgId = opts.orgId;
        this.datasourceId = opts.datasourceId;
        this.datasourceType = opts.datasourceType;
        this.logger = opts.logger;
        this.datasource = opts.datasource;
        this.state = opts.abState;
        this.revision = opts.abRevision;
        this.project = opts.project;
        this.abQuery = opts.abQuery;
        this.abConfig = opts.abConfig;
        this.database = opts.database;
        this.itemUploader = opts.itemUploader;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.context = opts.context;
        this.sqsClient = opts.sqsClient;
        this.customFieldConfig = opts.customFieldConfig;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.EXTRACT],
        });
    }
    isExtractDue(runParameters: ServiceDetails): boolean {
        if (!runParameters.isStateExtractDue) {
            this.logger.info(
                { message: `too soon to run the State extract, exiting` },
            );
            return false;
        }
        return true;
    }
    async getContextConfigs(): Promise<Array<ContextItem>> {
        const contexts = (
            await this.context.getContextsForOrgDataSource(
                this.orgId,
                this.datasourceId,
            )
        ).filter((context) => context.contextAddress);
        return contexts;
    }
    async getProjectConfigs(): Promise<ProjectItem[]> {
        const projects = await this.project.getAllProjects(
            this.orgId,
            this.datasourceId,
        );
        return projects;
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
    async getWorkItemTypeConfigs(): Promise<WorkItemTypeMapItem[]> {
        const workItemTypeMaps = await this.workItemTypeMap.getWorkItemTypeMaps(
            this.orgId,
            this.datasourceId,
        );
        return workItemTypeMaps;
    }
    async getCustomFieldConfigs(projectId?: string): Promise<CustomFieldConfig[]> {
        return await this.customFieldConfig.getCustomFieldConfigs(
            this.orgId,
            this.datasourceId,
            projectId,
        );
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
    sortWorkItem(items: any[]): any[] {
        //For ado, the items are already sorted
        return [];
    }
    getLinkedItemsConfigs(): any {
        ////TODO: figure out how we gets the linked item in ado
    }
    async extractState(startTimeMillis: number): Promise<void> {
        const runParameters = await this.getRunParameters();
        if (!this.isExtractDue(runParameters!)) {
            return;
        }

        const runDate = DateTime.utc().toISO();
        this.logger.info(({
            message: `ADO: [STATE:${this.orgId}] Extract state process started at ${runDate}`,
            orgId: this.orgId,
            startedAt: runDate,
            runDelay: runParameters.runDelayInMinutes
        }));

        // get the projects, and loop through all the project names from the datasource
        //  https://analytics.dev.azure.com/{namespace}/{projectName}/_odata/v2.0/
        //area path should include this project
        const projectItems = await this.getProjectConfigs();
        const workItemTypeMaps = await this.getWorkItemTypeConfigs();
        const contexts = await this.getContextConfigs();
        const privateFields = await this.getPrivateFieldsConfigs();
        const allWorkItems = (await this.getWorkItemsFromDatasource(
            contexts,
            workItemTypeMaps,
            projectItems,
            runParameters,
            privateFields,
            runDate,
        )) as any[];
        let countItemsUploadToS3 = 0;
        this.logger.info(({
            message: `Fetched ${allWorkItems.length} from datasource`,
            orgId: this.orgId,
        }));


        // Disable time to quit for now

        // const wasTimeToQuit = await this.checkIsTimeToQuit(startTimeMillis, runParameters);
        // if (!wasTimeToQuit) {
        //     await this.increaseBatchSizeWhenExtractFinished(
        //         countItemsUploadToS3,
        //         runParameters.batchSizeStateItems!,
        //     );
        // }
        const chunks = _.chunk(allWorkItems, 2000);
        let i = 0;
        for (const chunk of chunks) {
            const promises = chunk.map(adoItem => {
                const f = async () => {
                    const rawItem: RawItem = {
                        ...adoItem,
                        flomatikaFields: {
                            orgId: this.orgId,
                            datasourceId: this.datasourceId,
                            datasourceType: this.datasourceType,
                            extractTime: runDate,
                            workItemId: adoItem.WorkItemId,
                            excludeBeforeDate: runParameters.excludeItemsCompletedBeforeDate,
                        },
                    };
                    try {
                        const itemKey = await this.uploadWorkItemToS3(rawItem);
                        this.logger.info(({
                            message: `Uploaded work item to S3`,
                            orgId: this.orgId,
                            workItemId: rawItem.flomatikaFields.workItemId,
                            itemKey,
                        }));
                        if (itemKey) {
                            const sqsResult = await this.sendSQSMessage(itemKey);
                            this.logger.info(({
                                message: `Queued items to SQS`,
                                orgId: this.orgId,
                                workItemId: rawItem.flomatikaFields.workItemId,
                                itemKey,
                                sqsResult,
                            }));
                            if (sqsResult) {
                                countItemsUploadToS3 += 1;
                            }
                        }
                    } catch (error) {
                        this.logger.error(({
                            message: `Error in extract state loop`,
                            errorMessage: (error as Error).message,
                            errorStack: (error as Error).stack,
                            orgId: this.orgId,
                            workItemId: rawItem.flomatikaFields.workItemId,
                            datasourceId: this.datasourceId,
                            datasourceType: this.datasourceType,
                        }));
                    }
                    // console.log('lastItemUpdatedDate: ', lastItemUpdatedDate.toUTCString());
                };
                return f();
            });

            const start = DateTime.now().toMillis();
            await Promise.all(promises);
            const end = DateTime.now().toMillis();
            const diff = (end - start) / 1000;
            this.logger.info(({
                message: `Took ${diff}seconds to process S3 upload the notify promises`
            }));

            i += 1;
        }

        await this.setNextRunTimeForState(runParameters, allWorkItems, runDate);
    }
    private async setNextRunTimeForState(
        runParameters: ServiceDetails,
        workItems: any[],
        runDate: string,
    ) {
        let lastChangedDate = runParameters.nextRunStartFrom;

        if (workItems && 'length' in workItems && workItems.length > 0) {
            lastChangedDate = new Date(
                Math.max(...workItems.map((item) => item.ChangedDate)),
            ).toISOString();
        }

        await this.updateStateLastRun(runDate, lastChangedDate!);
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
        return this.itemUploader.uploadItem(item);
    }
    async sendSQSMessage(itemKey: string): Promise<SQS.SendMessageResult> {
        return this.sqsClient.sendMessageToQueueByDatasourceType(
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
                message: 'did not break time out, increasing batch size'
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
            this.logger.info(
                { message: `break from time out, reducing batch size` },
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
    async getWorkItemsFromDatasource(
        contextConfigs: ContextItem[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        projects: ProjectItem[],
        runParameters: ServiceDetails,
        privateFieldsConfigs: PrivateFields,
        runDate: string,
    ): Promise<any> {
        const allWorkItems: any[] = [];
        this.logger.info(({
            message: `All projects`,
            orgId: this.orgId,
            projectNames: JSON.stringify(projects.map(x => x.name))
        }));
        for (const project of projects) {
            this.logger.info(({
                message: `Start extract for project`,
                orgId: this.orgId,
                projectId: project.projectId,
                projectName: project.name
            }));

            const customFieldConfigsForProject = await this.getCustomFieldConfigs(project.projectId);
            const contextsForProject = contextConfigs.filter(context => context.projectId === project.projectId);

            const extraConfigs: ExtraConfigs = {
                workItemTypeMaps,
                contexts: contextsForProject,
                customFields: customFieldConfigsForProject,
                privateFields: privateFieldsConfigs,
            };

            const formattedUrl = [];
            const serviceUrl = runParameters.url!;
            const projectName = await this.abConfig.getAndUpdateProjectName(
                this.orgId,
                this.datasourceId,
                runParameters.accessToken!,
                runParameters.url!,
                project.projectId,
                project.name,
            );

            formattedUrl.push(...[serviceUrl, projectName, '_odata/v2.0']);
            const newRunParameters = {
                ...runParameters,
                url: formattedUrl.join('/'),
                baseUrl: serviceUrl
            };
            //Get current state of workItems
            try {
                const workItems = await this.getWorkItemsFromProject(
                    newRunParameters,
                    projectName, //use projectName to restrict contextAddress in filter
                    project.projectId,
                    extraConfigs,
                );
                this.logger.info(({
                    message: `Fetched workitems from project. Work items count: ${workItems.length}`,
                    orgId: this.orgId,
                    projectId: project.projectId,
                    projectName: project.name,
                }));
                const workItemRevisions =
                    await this.getRevisionsForSelectedWorkItems(
                        newRunParameters,
                        workItems,
                        extraConfigs.privateFields,
                        project.projectId
                    );
                //Get revisions for the above workItems so that we can identify and set the workflow event dates (Arrival, Commitment, Departure)
                //get workflows for the organisation so that we can know which workflow steps represent Arrival, Commitment, Departure for each individual workitem

                for (const workItem of workItems) {
                    this.identifyRevisionForWorkItem(
                        workItem,
                        workItemRevisions,
                    );
                    allWorkItems.push(workItem);
                }
            } catch (error) {
                if (error instanceof Response && error.status === 404) {
                    this.logger.info(({
                        message: '404 on projectId: ' + project.projectId,
                        errorMsg: JSON.stringify(error),
                    }));
                    continue;
                } else {
                    this.logger.info(({
                        message: 'Caught error in getWorkItemsFromDatasource',
                        errorMsg: JSON.stringify(error),
                    }));
                    continue;
                }
            }
            //sleep 500ms between queries to Azure Boards to prevent blockage from their side
            await sleep(this.logger, 500);
        }
        return allWorkItems;
    }
    private async getWorkItemsFromProject(
        runParameters: ServiceDetails,
        projectName: string,
        projectId: string,
        extraConfigs?: ExtraConfigs,
    ) {

        let lastChangeDate: Date | undefined;
        // If nextRunStartFrom is undefined, keep the date as undefined, do a full ingest
        // If nextRunStartFrom is NOT undefined, start ingested from the date of last ingested item
        if (runParameters.nextRunStartFrom) {
            lastChangeDate = await this.getLastChangedDateForProject(projectId, this.orgId);
        }
        return this.abQuery.getWorkItems(
            this.orgId,
            this.datasourceId,
            runParameters.url!,
            runParameters.baseUrl!,
            runParameters.accessToken!,
            runParameters.runDelayInMinutes,
            lastChangeDate,
            runParameters.batchSizeStateItems,
            runParameters.excludeItemsCompletedBeforeDate
                ? new Date(runParameters.excludeItemsCompletedBeforeDate)
                : undefined,
            projectName,
            projectId,
            extraConfigs,
        );
    }
    private identifyRevisionForWorkItem(workItem: any, workItemRevisions: any) {
        workItem.revisions = workItemRevisions.filter(
            (revision: any) => revision.WorkItemId === workItem.WorkItemId,
        );
    }
    private async getRevisionsForSelectedWorkItems(
        runParameters: ServiceDetails,
        workItems: any[],
        privateFields: PrivateFields,
        projectId: string,
    ) {
        return this.revision.getWorkItemRevisionsForWorkflowEvents(
            this.orgId,
            this.datasourceId,
            runParameters.url!,
            runParameters.baseUrl!,
            runParameters.accessToken!,
            workItems.map((workItem) => workItem.WorkItemId),
            projectId,
            privateFields,
        );
    }

    /**
     * Get the changedDate of the last ingested work item
     * in the given project
     */
    private async getLastChangedDateForProject(projectId: string, orgId: string): Promise<Date | undefined> {
        let lastChangeDate;
        try {
            const database = await this.database;
            const query = `
                select
                s."workItemId",
                s."changedDate"
                from states s
                where s."projectId" = :projectId
                and s."partitionKey" = 'state#' || :orgId
                order by s."updatedAt" desc
                limit 1
            `;
            const rows = await database.query(query.trim(), {
                replacements: {
                    orgId,
                    projectId,
                },
                type: QueryTypes.SELECT,
            });
            if (rows.length === 0) {
                this.logger.info(({
                    message: 'getLastChangedDateForProject - Fetched zero items',
                    projectId,
                    orgId,
                    rows
                }));
            } else if (rows.length > 0 && rows[0] !== undefined) {
                this.logger.info(({
                    message: 'getLastChangedDateForProject - Fetched last ingested item in the project',
                    projectId,
                    orgId,
                    workItemId: (rows[0] as any).workItemId,
                    changedDate: (rows[0] as any).changedDate,
                    rows,
                }));
                lastChangeDate = (rows[0] as any).changedDate;
            }
        }
        catch (e) {
            const message = `getLastChangedDateForProject - Error fetching last change date for the project`;
            this.logger.error(({
                message,
                projectId,
                orgId,
                errorMessage: (e as Error).message,
                stack: (e as Error).stack,
            }));
        }
        return lastChangeDate;
    }

}
