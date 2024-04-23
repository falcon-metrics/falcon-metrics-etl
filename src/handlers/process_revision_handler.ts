import { asClass, asValue } from 'awilix';
import { Context as LambdaContext, SQSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { AdoRevisionProcessor } from '../azureboards/process/revision_processor';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { UnmappedWorkflowStepProcessor } from '../common/unmapped_workflow_step';
import { ConfigFactory } from '../configuration/config';
import { EventDateExtractor } from '../configuration/event_date_extractor';
import { Context } from '../data/context_aurora';
import { Project } from '../data/project_aurora';
import { WorkItemTypeMap } from '../data/work_item_type_aurora';
import { JiraRevisionProcessor } from '../jiracloud/process/revision_processor';
import { KanbanizeTransformProcessor } from '../kanbanize/transform_processor';
import {
    SnapshotLoadNeededNotifier,
    StateLoadNeededNotifier,
} from '../notifications/load_needed_notifier';
import { IRevisionProcessor } from '../process_interfaces/revision_process_interface';
import { S3Client } from '../workitem/s3_client';
export const process = async (
    event: SQSEvent,
    context: LambdaContext,
): Promise<string> => {
    for (const record of event.Records) {
        const container = await getDependencyInjectionContainer();
        container.register({
            revisionProcessor: asClass(JiraRevisionProcessor),
            s3Client: asClass(S3Client),
            workItemTypeMap: asClass(WorkItemTypeMap),
            eventDateExtractor: asClass(EventDateExtractor),
            stateLoadNotifier: asClass(StateLoadNeededNotifier),
            snapshotLoadNotifier: asClass(SnapshotLoadNeededNotifier),
            lambdaContext: asValue(context),
            unmappedWorkflowStep: asClass(UnmappedWorkflowStepProcessor),
            configFactory: asClass(ConfigFactory),
            project: asClass(Project),
            context: asClass(Context),
        });
        const messageBody = JSON.parse(record.body) as { s3Key: string };
        const s3Key = messageBody.s3Key;
        const datasourceItem = await (
            container.cradle.s3Client as S3Client
        ).getItemFromKey(s3Key);

        const datasourceId = datasourceItem?.flomatikaFields?.datasourceId;
        const orgId = datasourceItem?.flomatikaFields?.orgId;

        let logger: Logger = container.cradle.logger;

        container.register({
            orgId: asValue(orgId),
            datasourceId: asValue(datasourceId),
            logger: asValue(logger.child({ orgId, datasourceId })),
        });

        logger = container.cradle.logger;

        logger.info({
            message: 'Process revision handler',
            workItemId: datasourceItem.flomatikaFields.workItemId,
            orgId: datasourceItem.flomatikaFields.orgId,
        });
        const datasourceType = datasourceItem.flomatikaFields.datasourceType;
        switch (datasourceType) {
            case 'jira-cloud':
            case 'jira-server':
                container.register({
                    revisionProcessor: asClass(JiraRevisionProcessor),
                });
                break;
            case 'azure-boards':
                container.register({
                    revisionProcessor: asClass(AdoRevisionProcessor),
                });
                break;
            case 'kanbanize':
                container.register({
                    revisionProcessor: asClass(KanbanizeTransformProcessor),
                });
                break;
            default:
                logger.error(
                    `Invalid datasource type ${datasourceItem.flomatikaFields.datasourceType} for revision processor`,
                );
        }
        try {
            if (datasourceType === 'kanbanize') {
                await (
                    container.cradle
                        .revisionProcessor as KanbanizeTransformProcessor
                ).transform(datasourceItem as any);
            } else {
                await (
                    container.cradle.revisionProcessor as IRevisionProcessor
                ).processRevisions(datasourceItem);
            }
        } catch (e) {
            logger.error(
                JSON.stringify({
                    message: 'Process revision failed',
                    errorMessage: (e as Error).message,
                    errorStack: (e as Error).stack,
                    workItem: JSON.stringify(datasourceItem),
                }),
            );
            throw e;
        }
    }
    return 'okay';
};
