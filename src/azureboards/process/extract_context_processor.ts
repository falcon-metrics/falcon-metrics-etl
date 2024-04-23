import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { sleep } from '../../common/extract_utils';
import { IEventDateExtractor } from '../../configuration/event_date_extractor';
import { IContext } from '../../data/context_aurora';
import { IDatasource } from '../../data/datasource_aurora';
import { IProject, ProjectItem } from '../../data/project_aurora';
import { IWorkItemTypeMap } from '../../data/work_item_type_aurora';
import { IContextMappingNotifier } from '../../notifications/context_mapping_notifier';
import { ISqsClient } from '../../notifications/sqs_client';
import { CONTEXT_WORKITEM_MAPPING_QUEUE, IExtractContextProcessor } from '../../process_interfaces/extract_context_process_interface';
import { LogTags } from '../../utils/log_tags';
import { IAbConfig } from '../data/ab_config';
import { IABQuery } from '../data/ab_query';
import { IABRevision } from '../data/ab_revision';
import { IABWorkItem } from '../data/ab_work_item';
import { IResponseLogger } from './ab_response_logger';
import _ from 'lodash';
import { IS3Client } from '../../workitem/s3_client';

export class AdoExtractContextProcessor implements IExtractContextProcessor {
    private orgId: string;
    private datasourceId: string;
    private logger: Logger;
    private datasource: IDatasource;
    private state: IABWorkItem;
    private context: IContext;
    private contextMappingNotifier: IContextMappingNotifier;
    private project: IProject;
    private sqsClient: ISqsClient;
    private itemUploader: IS3Client;

    constructor(opts: {
        orgId: string;
        datasourceId: string;
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
        sqsClient: ISqsClient;
        itemUploader: IS3Client;
    }) {
        this.orgId = opts.orgId;
        this.datasourceId = opts.datasourceId;
        this.logger = opts.logger;
        this.datasource = opts.datasource;
        this.state = opts.abState;
        this.context = opts.context;
        this.contextMappingNotifier = opts.contextMappingNotifier;
        this.project = opts.project;
        this.sqsClient = opts.sqsClient;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
        });
        this.itemUploader = opts.itemUploader;
    }
    private formatUrl(project: ProjectItem, serviceUrl: string) {
        const formattedUrl: string[] = [];
        const projectName = project.name;
        formattedUrl.push(...[serviceUrl, projectName, '_odata/v2.0']);
        return formattedUrl.join('/');
    }
    async extractContextWorkItemMaps(contextId: string): Promise<void> {
        this.logger.info({ message: `starting extract contexts for context : ${contextId}` });
        const runParameters = await this.datasource.getServiceDetails(
            this.orgId,
            this.datasourceId,
        );
        if (!runParameters)
            throw new Error('I could not find any datasource parameters');
        const projectItems = await this.project.getAllProjects(
            this.orgId,
            this.datasourceId,
        );
        const startTime = DateTime.now();

        const allContexts = await this.context.getContextsForOrgDataSource(
            this.orgId,
            this.datasourceId,
        );

        this.logger.info({ message: `All project items`, projectItems });
        this.logger.info({ message: `All context items`, allContexts });

        for (const project of projectItems) {
            this.logger.info(({
                message: 'Started processing project for extracting context work item maps',
                project,
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                tag: [LogTags.CONTEXT_WORKITEM_MAPPING]
            }));

            const contextsForProject = allContexts.filter(
                (context) =>
                    context.contextAddress &&
                    context.projectId === project.projectId &&
                    context.id === contextId
            );
            this.logger.info({
                message: `Contexts for Project`, contextsForProject, project
            });

            if (contextsForProject.length === 0) {
                this.logger.info({
                    message: `No contexts found for project. Continuing loop`, contextsForProject
                });
                continue;
            }

            const workItemTypeIds = await this.state.workItemTypeIdsInProject(project.projectId, this.orgId, this.datasourceId);
            if (workItemTypeIds.length === 0) {
                // If no workitem types configured for this project, skip the extract for this project
                this.logger.info(({
                    message: 'No work item types configured for this project. Skipping the extract of work item ids for this project',
                    projectId: project.projectId,
                    projectName: project.name,
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    tag: [LogTags.CONTEXT_WORKITEM_MAPPING]
                }));
                continue;
            }

            const formattedUrl = this.formatUrl(project, runParameters.url!);

            for (const context of contextsForProject) {
                this.logger.info(({
                    message: 'Started processing context for extracting context work item maps',
                    project,
                    context,
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    tag: [LogTags.CONTEXT_WORKITEM_MAPPING]
                }));
                try {
                    const excludeDate =
                        runParameters.excludeItemsCompletedBeforeDate
                            ? new Date(
                                runParameters.excludeItemsCompletedBeforeDate,
                            )
                            : undefined;
                    const areaIds = (context.contextAddress ?? '').split(',');
                    const itemIdsFromAreaPath =
                        await this.state.getIdsFromAreaPath(
                            this.orgId,
                            this.datasourceId,
                            formattedUrl,
                            runParameters.accessToken!,
                            areaIds,
                            project.projectId,
                            excludeDate,
                        );
                    this.logger.info(({
                        message: `Extracted items from context. Extracted ${itemIdsFromAreaPath?.length ?? 0} items.`,
                        count: itemIdsFromAreaPath?.length,
                        contextId: context.id,
                        contextAddress: context.contextAddress,
                        contextName: context.name,
                        orgId: this.orgId,
                        projectId: project.projectId,
                        projectName: project.name,
                        tag: [LogTags.CONTEXT_WORKITEM_MAPPING]
                    }));

                    if (!(itemIdsFromAreaPath && itemIdsFromAreaPath.length))
                        continue;

                    const s3UploadResult = await this.itemUploader.uploadWorkItemArray(itemIdsFromAreaPath, context.id, this.orgId, this.datasourceId);
                    const result = await this.sqsClient.sendMessageToQueue(
                        CONTEXT_WORKITEM_MAPPING_QUEUE,
                        {
                            orgId: this.orgId,
                            datasourceId: this.datasourceId,
                            contextId: context.id,
                            workItemIdKey: s3UploadResult,
                            extractRunAt: DateTime.now().toISO()
                        }
                    );
                    //sleep 5000ms between queries to Azure Boards to prevent blockage from their side
                    await sleep(this.logger, 5000);
                } catch (e) {
                    this.logger.info(({
                        message: `Error fetching ids from context`,
                        orgId: this.orgId,
                        context,
                        project,
                        datasourceId: this.datasourceId,
                        tag: [LogTags.CONTEXT_WORKITEM_MAPPING],
                        errorMessage: JSON.stringify(e)
                    }));
                }
            }
        }

        const endTime = DateTime.now();
        const elapsedTimeMs = endTime.diff(startTime, 'seconds').seconds;
        this.logger.info(({
            message: `Finished extracting work items for context`,
            executionTime: `${elapsedTimeMs} seconds`,
            orgId: this.orgId,
            tag: [LogTags.CONTEXT_WORKITEM_MAPPING]
        }));
    }

}
