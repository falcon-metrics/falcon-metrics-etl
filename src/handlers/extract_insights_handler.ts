import { asClass, AwilixContainer } from 'awilix';
import { ScheduledEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { InsightsData } from '../flomatika_app/data/fl_insights';
import { ExtractFlomatikaInsightsProcessor } from '../flomatika_app/process/extract_flomatika_insights_processor';
import { SqsClient } from '../notifications/sqs_client';
import { IExtractInsightsProcessor } from '../process_interfaces/extract_insights_process_interface';
import { Auth0Secret } from '../secrets/auth0_secret';

const registerInsightsExtractor = (container: AwilixContainer) => {
    container.register({
        insightsData: asClass(InsightsData),
        secrets: asClass(Auth0Secret),
        insightsProcessor: asClass(ExtractFlomatikaInsightsProcessor),
        sqsClient: asClass(SqsClient),
    });
};

export const process = async (event: ScheduledEvent) => {
    const container = await getDependencyInjectionContainer();
    const logger: Logger = container.cradle.logger;

    const { orgId } = event.detail as { orgId?: string };
    logger.info({
        message: 'Received scheduled event',
        event,
        orgId: orgId,
    });

    try {
        registerInsightsExtractor(container);

        await (
            container.cradle.insightsProcessor as IExtractInsightsProcessor
        ).extractInsights(orgId);
    } catch (e) {
        logger.error('Extract insights failed');
        throw e;
    }

    return 'got it!';
};
