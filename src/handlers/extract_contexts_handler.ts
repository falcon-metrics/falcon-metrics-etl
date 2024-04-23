import { asValue, asClass, AwilixContainer } from 'awilix';
import { Context as AWSContext, SNSEvent, SQSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { AbConfig } from '../azureboards/data/ab_config';
import { ADOResponseLogger } from '../azureboards/process/ab_response_logger';
import { ABWorkItem } from '../azureboards/data/ab_work_item';
import { AdoExtractContextProcessor } from '../azureboards/process/extract_context_processor';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { Context, ContextItem } from '../data/context_aurora';
import { Datasource, DatasourceItem } from '../data/datasource_aurora';
import { Project } from '../data/project_aurora';
import { WorkItemTypeMap } from '../data/work_item_type_aurora';
import { JCIssue } from '../jiracloud/data/jc_issue';
import { JiraExtractContextProcessor } from '../jiracloud/process/extract_context_processor';
import { ContextMappingNotifier } from '../notifications/context_mapping_notifier';
import { IExtractContextProcessor } from '../process_interfaces/extract_context_process_interface';
import { UnmappedWorkflowStepProcessor } from '../common/unmapped_workflow_step';
import { ConfigFactory } from '../configuration/config';
import { KanbanizeExtractProcessor } from '../kanbanize/extract_state_processor';
import { EventDateExtractor } from '../configuration/event_date_extractor';
import { S3Client } from '../workitem/s3_client';
import { SqsClient } from '../notifications/sqs_client';
import { ContextsQueuer } from './contexts_queuer';
import _ from 'lodash';

const registerJiraExtractor = (container: AwilixContainer) => {
    container.register({
        jcState: asClass(JCIssue),
        extractContextProcessor: asClass(JiraExtractContextProcessor),
        project: asClass(Project),
        workItemTypeMap: asClass(WorkItemTypeMap),
        sqsClient: asClass(SqsClient),
        itemUploader: asClass(S3Client),
    });
};
const registerAzureBoardsExtractor = (container: AwilixContainer) => {
    container.register({
        abState: asClass(ABWorkItem),
        extractContextProcessor: asClass(AdoExtractContextProcessor),
        project: asClass(Project),
        workItemTypeMap: asClass(WorkItemTypeMap),
        responseLogger: asClass(ADOResponseLogger),
        abConfig: asClass(AbConfig),
        sqsClient: asClass(SqsClient),
        itemUploader: asClass(S3Client),
    });
};
const registerKanbanizeExtractor = (container: AwilixContainer) => {
    container.register({
        unmappedWorkflowStep: asClass(UnmappedWorkflowStepProcessor),
        configFactory: asClass(ConfigFactory),
        extractContextProcessor: asClass(KanbanizeExtractProcessor),
        workItemTypeMap: asClass(WorkItemTypeMap),
        project: asClass(Project),
        eventDateExtractor: asClass(EventDateExtractor),
        itemUploader: asClass(S3Client),
        sqsClient: asClass(SqsClient),
        datasource: asClass(Datasource),
    });
};

const register = (datasourceType: string, container: AwilixContainer) => {
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
            throw new Error(
                'Invalid datasource type for extract context processor',
            );
    }
};

export const queueContexts = async (event: SNSEvent, context: AWSContext) => {
    const container = await getDependencyInjectionContainer(event, context);
    const datasourceType = container.cradle.datasourceType as string;
    const orgId = container.cradle.orgId;
    const logger: Logger = container.cradle.logger;

    container.register({
        lambdaContext: asValue(context),
        context: asClass(Context),
        contextsQueuer: asClass(ContextsQueuer),
        sqsClient: asClass(SqsClient),
    });

    try {
        const queuer: ContextsQueuer = container.cradle.contextsQueuer;
        await queuer.queueContextsForExtract();
    } catch (e) {
        logger.error({
            message: 'Extract context failed',
            orgId,
            datasourceType,
            errorMessage: (e as Error).message,
        });
        throw e;
    }

    return 'got it!';
};

type Payload = { context: ContextItem; datasource: DatasourceItem };

const processOrgContexts = async (
    payloads: Payload[],
    container: AwilixContainer,
) => {
    const logger: Logger = container.cradle.logger;

    for (const { context, datasource } of payloads) {
        if (context === undefined || datasource === undefined) {
            throw new Error(
                'Invalid payload. context and datasource are required',
            );
        }
        logger.info({
            message: 'Processing context',
            context,
            datasource,
        });
        const { orgId, datasourceId, datasourceType } = datasource;
        container.register({
            orgId: asValue(orgId),
            datasourceId: asValue(datasourceId),
            datasourceType: asValue(datasourceType),
            logger: asValue(
                logger.child({ orgId, datasourceId, datasourceType }),
            ),
            context: asClass(Context),
            datasource: asClass(Datasource),
            contextMappingNotifier: asClass(ContextMappingNotifier),
        });
        register(datasourceType, container);
        await (
            container.cradle.extractContextProcessor as IExtractContextProcessor
        ).extractContextWorkItemMaps(context.id);
    }
};

export const processQueuedContexts = async (
    event: SQSEvent,
    lambdaContext: AWSContext,
) => {
    const container = await getDependencyInjectionContainer();
    container.register({
        lambdaContext: asValue(lambdaContext),
    });

    const logger: Logger = container.cradle.logger;
    logger.info({
        message: 'Received event in context extractor',
        records: event.Records,
    });
    try {
        const payloads = [];
        for (const record of event.Records) {
            const body = JSON.parse(record.body) as Payload;
            payloads.push(body);
        }
        logger.info({
            message: 'Parsed the payloads',
            payloads,
        });
        const groups = _.groupBy(payloads, (p) => p.datasource.orgId);
        for (const [orgId, orgPayloads] of Object.entries(groups)) {
            try {
                logger.info({
                    message: 'Starting processing contexts for org',
                    orgId,
                    orgContexts: orgPayloads,
                });
                await processOrgContexts(orgPayloads, container);
            } catch (e) {
                logger.error({
                    message: 'Error processing contexts for org',
                    orgId,
                    orgContexts: orgPayloads,
                    errorMessage: e.message,
                    errorStack: e.stack,
                });
            }
        }
    } catch (e) {
        logger.error({
            message: 'Error in processQueuedContexts',
            errorMessage: e.message,
            errorStack: e.stack,
            event,
        });
        throw e;
    }
};
