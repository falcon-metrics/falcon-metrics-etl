import { asClass, asValue, AwilixContainer } from 'awilix';
import { Context as AWSContext, SNSEvent } from 'aws-lambda';
import _ from 'lodash';
import { Logger } from 'pino';
import { QueryTypes, Sequelize } from 'sequelize';
import { AbConfig } from '../azureboards/data/ab_config';
import { ABRevision } from '../azureboards/data/ab_revision';
import { ABWorkItem } from '../azureboards/data/ab_work_item';
import { ADOResponseLogger } from '../azureboards/process/ab_response_logger';
import { AdoExtractProcessor } from '../azureboards/process/extract_states_processor';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { UnmappedWorkflowStepProcessor } from '../common/unmapped_workflow_step';
import { ConfigFactory } from '../configuration/config';
import { EventDateExtractor } from '../configuration/event_date_extractor';
import { Context } from '../data/context_aurora';
import { Datasource } from '../data/datasource_aurora';
import { Project } from '../data/project_aurora';
import { WorkItemTypeMap } from '../data/work_item_type_aurora';
import { JCConfig } from '../jiracloud/data/jc_config';
import { JCIssue } from '../jiracloud/data/jc_issue';
import { JCStatus } from '../jiracloud/data/jc_status';
import { JiraExtractProcessor } from '../jiracloud/process/extract_state_processor';
import { KanbanizeExtractProcessor } from '../kanbanize/extract_state_processor';
import { ContextMappingNotifier } from '../notifications/context_mapping_notifier';
import {
    ExtractKickoffNotifier,
    ExtractType,
} from '../notifications/extract_kickoff_notifier';
import { QueueType, SqsClient } from '../notifications/sqs_client';
import { IExtractStateProcessor } from '../process_interfaces/extract_states_process_interface';
import {
    isDev,
    orgId as devOrgId,
    datasourceId as devDatasourceId,
} from '../utils/dev';
import { LogTags } from '../utils/log_tags';
import { S3Client } from '../workitem/s3_client';

const registerJiraExtractor = (container: AwilixContainer) => {
    container.register({
        jcState: asClass(JCIssue),
        jcStatus: asClass(JCStatus),
        jcConfig: asClass(JCConfig),
        extractProcessor: asClass(JiraExtractProcessor),
    });
};
const registerAzureBoardsExtractor = (container: AwilixContainer) => {
    container.register({
        abState: asClass(ABWorkItem),
        abConfig: asClass(AbConfig),
        abRevision: asClass(ABRevision),
        extractProcessor: asClass(AdoExtractProcessor),
    });
};
const registerKanbanizeExtractor = (container: AwilixContainer) => {
    container.register({
        unmappedWorkflowStep: asClass(UnmappedWorkflowStepProcessor),
        extractProcessor: asClass(KanbanizeExtractProcessor),
    });
};

const kickOffExtractContexts = async (container: AwilixContainer) => {
    const logger: Logger = container.cradle.logger;
    try {
        const configFactory = container.cradle.configFactory as ConfigFactory;
        const config = await configFactory.create();

        if (!config.serviceDetails.nextRunStartFrom) {
            logger.info({
                message:
                    'nextRunStartFrom is undefined. Notifying context work item mapper',
                datasourceId: config.datasourceId,
                datasourceType: config.datasourceType,
                orgId: config.orgId,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
            });
            const extractKickoffNotifier = container.cradle
                .extractKickoffNotifier as ExtractKickoffNotifier;
            await extractKickoffNotifier.notify(
                ExtractType.EXTRACT_CONTEXTS,
                config.orgId,
                config.datasourceId,
                config.datasourceType,
            );
        }
    } catch (e) {
        logger?.error(
            JSON.stringify({
                message: 'Failed to nofiy context work item mapper',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
            }),
        );
    }
};

export const process = async (event: SNSEvent, context: AWSContext) => {
    let logger: Logger | undefined;
    let datasourceType: string | undefined;
    try {
        const container = await getDependencyInjectionContainer(event);
        logger = container.cradle.logger;

        container.register({
            lambdaContext: asValue(context),
            context: asClass(Context),
            contextMappingNotifier: asClass(ContextMappingNotifier),
            workItemTypeMap: asClass(WorkItemTypeMap),
            project: asClass(Project),
            eventDateExtractor: asClass(EventDateExtractor),
            responseLogger: asClass(ADOResponseLogger),
            itemUploader: asClass(S3Client),
            sqsClient: asClass(SqsClient),
            datasource: asClass(Datasource),
            extractKickoffNotifier: asClass(ExtractKickoffNotifier),
            configFactory: asClass(ConfigFactory),
            unmappedWorkflowStep: asClass(UnmappedWorkflowStepProcessor),
        });

        await kickOffExtractContexts(container);

        datasourceType = container.cradle.datasourceType as string;
        switch (datasourceType) {
            case 'jira-cloud':
            case 'jira-server':
                registerJiraExtractor(container);
                break;
            case 'azure-boards':
                registerAzureBoardsExtractor(container);
                break;
            case 'kanbanize':
                registerKanbanizeExtractor(container);
                break;
            default:
                (container.cradle.logger as Logger).error(
                    `Invalid datasource type ${datasourceType} for extract processor`,
                );
        }

        const startTimeMillis = Date.now();
        // Using if-else here because of the new design
        if (datasourceType === 'kanbanize') {
            await (
                container.cradle.extractProcessor as KanbanizeExtractProcessor
            ).extractState();
        } else {
            await (
                container.cradle.extractProcessor as IExtractStateProcessor
            ).extractState(startTimeMillis);
        }
    } catch (e) {
        (logger ?? console).error(
            JSON.stringify({
                message: 'Extract State Failed',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                datasourceType,
            }),
        );
        throw e;
    }

    return 'got it!';
};

const validateEvent = (event: SNSEvent) => {
    // Disable event validation for development. Because during development, this will be
    // triggered by an HTTP API
    if (isDev) return;

    const messagePayload = JSON.parse(event.Records[0].Sns.Message);
    const { orgId, datasourceId } = messagePayload;
    if (
        !(
            orgId !== undefined &&
            typeof orgId === 'string' &&
            datasourceId !== undefined &&
            typeof datasourceId === 'string'
        )
    ) {
        throw new Error('Invalid payload. orgId and datasourceId is required');
    }
};

const getS3Keys = async (
    database: Sequelize,
    orgId: string,
    datasourceId: string,
) => {
    const query = `
            with ids1 as (
                select 
                    distinct(p."orgId" || 
                    '/' || 
                    d."datasourceType" || 
                    '-' || 
                    p."datasourceId" || 
                    '/' || 
                    s."workItemId" || 
                    '.json') as "s3ItemKey"
                from states s 
                join projects p on s."projectId" = p."projectId" and s."partitionKey" = 'state#' || p."orgId"
                join datasources d on p."datasourceId"  = d."datasourceId" 
                where d."orgId" = :orgId
                and d."datasourceId" = :datasourceId
            ),
            ids2 as (
                select 
                distinct(c."orgId" || 
                    '/' || 
                    d."datasourceType" || 
                    '-' || 
                    d."datasourceId" || 
                    '/' || 
                    cwim."workItemId" || 
                    '.json') as "s3ItemKey"
                from "contextWorkItemMaps" cwim 
                join contexts c on cwim."contextId" = c."contextId" and c."orgId" = cwim."orgId" 
                join datasources d on c."datasourceId" = d."datasourceId" and c."orgId" = d."orgId" 
                where c."obeyaId" is null
                and c.archived = false
                and d."orgId" = :orgId
                and d."datasourceId" = :datasourceId
            ),
            all_ids as (
                select "s3ItemKey"
                from ids1 
                union 
                select "s3ItemKey"
                from ids2
            )
            select distinct("s3ItemKey")
            from all_ids
        `;
    const rows = await database.query(query.trim(), {
        replacements: {
            orgId,
            datasourceId,
        },
        type: QueryTypes.SELECT,
    });
    return rows.map((r: any) => r.s3ItemKey as string);
};
export const reingest = async (event: SNSEvent, context: AWSContext) => {
    console.log({ message: 'Before validation', event, context });
    validateEvent(event);
    let logger: Logger | undefined;
    let orgId;
    let datasourceId;
    try {
        const container = await getDependencyInjectionContainer(event);
        logger = container.cradle.logger;
        logger?.info({ message: 'Received event', event });
        container.register({
            lambdaContext: asValue(context),
            context: asClass(Context),
            contextMappingNotifier: asClass(ContextMappingNotifier),
            workItemTypeMap: asClass(WorkItemTypeMap),
            project: asClass(Project),
            eventDateExtractor: asClass(EventDateExtractor),
            responseLogger: asClass(ADOResponseLogger),
            itemUploader: asClass(S3Client),
            sqsClient: asClass(SqsClient),
            datasource: asClass(Datasource),
            extractKickoffNotifier: asClass(ExtractKickoffNotifier),
            configFactory: asClass(ConfigFactory),
            unmappedWorkflowStep: asClass(UnmappedWorkflowStepProcessor),
        });

        const database: Sequelize = await container.cradle.database;
        if (!isDev) {
            orgId = container.cradle.orgId;
            datasourceId = container.cradle.datasourceId;
        } else {
            orgId = devOrgId;
            datasourceId = devDatasourceId;
        }
        const sqsClient = container.cradle.sqsClient;

        logger?.info({ message: 'Starting reingest', event });

        const itemKeys = await getS3Keys(database, orgId, datasourceId);

        if (itemKeys.length === 0) {
            logger?.info({
                message: 'No items to reingest',
                count: itemKeys.length,
                orgId,
                datasourceId,
            });
        } else if (itemKeys.length > 0) {
            logger?.info({
                message: 'Fetched keys',
                count: itemKeys.length,
                orgId,
                datasourceId,
            });
            const CHUNK_SIZE = 10000;
            const chunks = _.chunk(itemKeys, CHUNK_SIZE);
            let i = 0;
            for (const chunk of chunks) {
                const batches = _.chunk(chunk, 10);
                const promises: any[] = [];
                for (const batch of batches) {
                    logger?.info({
                        // For debugging only. TODO: Remove
                        message: 'batch',
                        batch,
                        orgId,
                        datasourceId,
                        chunkIndex: i,
                    });
                    promises.push(
                        sqsClient.sendMessageBatchToQueueByDatasourceType(
                            QueueType.PROCESS_REVISIONS,
                            batch,
                        ),
                    );
                }
                try {
                    await Promise.all(promises);
                } catch (e) {
                    logger?.info({
                        message: 'Error processing chunk',
                        chunkIndex: i,
                        orgId,
                        datasourceId,
                    });
                }
                i++;
            }
            logger?.info({
                message: 'Queued items for reingestion',
                count: itemKeys.length,
                orgId,
                datasourceId,
            });
        }
    } catch (e) {
        (logger ?? console).error(
            JSON.stringify({
                message: 'Trigger re-ingest failed',
                orgId,
                datasourceId,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }),
        );
        throw e;
    }

    return 'got it!';
};
