import { asClass, asValue } from 'awilix';
import { Context as AWSContext, SNSEvent, SQSEvent } from 'aws-lambda';
import _ from 'lodash';
import { Logger } from 'pino';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import {
    EventType,
    getEventType,
    parseSNSPayloads,
    parseSQSPayloads,
} from '../common/extract_utils';
import { IDatasource } from '../data/datasource_aurora';
import { VCData } from '../data/vc_data';
import { GitDataExtractor } from '../git_data_extractor/common';
import {
    GitlabExtractor,
    Notifier,
} from '../git_data_extractor/gitlab_extractor';
import { SqsClient } from '../notifications/sqs_client';
import { QueueManager } from '../scheduler/queue_manager';
import { orgId as devOrgId, isDev } from '../utils/dev';

// Both of these should match what is in the serverless file
// If we decide to refactor all the function names and queue names, this will break
export const EXTRACT_VC_QUEUE = 'ExtractVCDataQueue';
export const EXTRACT_VC_LAMBDA_FUNCTION = 'extractVCData';

type Payload = {
    orgId: string;
    projectId: string;
};

export const handler = async (
    event: SQSEvent | SNSEvent,
    context: AWSContext,
) => {
    let logger: Logger | undefined;
    try {
        const container = await getDependencyInjectionContainer(event as any);
        logger = container.cradle.logger;

        const eventType = getEventType(event);
        let payloads: Payload[] = [];

        if (eventType === undefined) {
            const message = 'Unknown event type';
            logger?.error({
                message,
                event,
            });
            throw new Error(message);
        }

        switch (eventType) {
            case EventType.SNS:
                payloads = parseSNSPayloads(event as SNSEvent);
                break;
            case EventType.SQS:
                payloads = parseSQSPayloads(event as SQSEvent);
                break;
            default: {
                const message = 'Unknown event type';
                logger?.error({
                    message,
                    event,
                });
                throw new Error(message);
            }
        }

        logger?.info({
            message: 'Parsed the payloads',
            payloads,
            eventType,
            event,
        });

        for (const payload of payloads) {
            const { orgId, projectId } = payload;
            container.register({
                lambdaContext: asValue(context),
                orgId: asValue(orgId),
                vcProjects: asClass(VCData),
                notifier: asClass(Notifier),
                sqsClient: asClass(SqsClient),
                extractor: asClass(GitlabExtractor),
            });
            const extractor = container.cradle.extractor as GitlabExtractor;
            await extractor.extract(orgId, projectId);
        }
    } catch (e) {
        const message = 'Error when extracting VC Project';
        logger?.error({
            message,
            event,
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
        });
    }
    return '';
};

export const schedule = async (event: SNSEvent, context: AWSContext) => {
    let logger: Logger | undefined;

    try {
        const container = await getDependencyInjectionContainer(event);

        const queueManager = new QueueManager();
        // The queue is already created by serverless a this point
        // This function does not create the queue if it has been created already
        await queueManager.createQueueAndConfigureLambda(
            EXTRACT_VC_QUEUE,
            EXTRACT_VC_LAMBDA_FUNCTION,
            // Process one project at a time, no parallel processing
            // In the future we change to create one queue per org,
            // And process each project one by one in the org
            // Orgs will be processed in parallel
            { maximumConcurrency: 2, batchSize: 1 },
        );

        const ds = container.cradle.datasource as IDatasource;
        const allDatasources = await ds.getAll();
        const orgIds = _.chain(allDatasources)
            .filter((ds) => !!ds.enabled)
            .map((ds) => ds.orgId)
            .filter((orgId) => (isDev ? orgId === devOrgId : true))
            .uniq()
            .value();

        for (const orgId of orgIds) {
            container.register({
                lambdaContext: asValue(context),
                vcProjects: asClass(VCData),
                orgId: asValue(orgId),
                notifier: asClass(Notifier),
                sqsClient: asClass(SqsClient),
                extractor: asClass(GitlabExtractor),
            });

            const vcProjects = container.cradle.vcProjects as VCData;
            const extractor = container.cradle.extractor as GitDataExtractor;

            const projects = await vcProjects.getProjects(orgId);
            await Promise.all(
                projects.map((p) =>
                    extractor.queueProjectForExtract(p.orgId, p.id),
                ),
            );
        }
    } catch (e) {
        logger?.error({
            message: 'Error when scheduling version control data extract',
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
        });
    }

    return '';
};
