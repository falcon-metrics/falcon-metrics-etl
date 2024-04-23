import { AwilixContainer, asClass } from 'awilix';
import { Context as LambdaContext, SQSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { InsightsData } from '../flomatika_app/data/fl_insights';
import {
    ExtractFlomatikaInsightsProcessor,
    InsightsQueueItem,
} from '../flomatika_app/process/extract_flomatika_insights_processor';
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

export const process = async (event: SQSEvent, context: LambdaContext) => {
    const begin = Date.now();
    const container = await getDependencyInjectionContainer();
    const logger: Logger = container.cradle.logger;
    logger.info({
        message: 'Received SQS event',
        recordsCount: event.Records.length,
    });
    try {
        registerInsightsExtractor(container);
        let successCount = 0;
        const promises = [];
        for (const record of event.Records) {
            const body: InsightsQueueItem = JSON.parse(record.body);
            const { view, jwt } = body;

            const fn = async () => {
                try {
                    await (
                        container.cradle
                            .insightsProcessor as IExtractInsightsProcessor
                    ).extractFromView(view, jwt);
                    successCount++;
                } catch (e) {
                    container.cradle.logger.error(
                        JSON.stringify({
                            message: 'Extract insight view failed',
                            view,
                            errorMessage: (e as Error).message,
                            errorStack: (e as Error).stack,
                        }),
                    );
                }
            };
            promises.push(fn());
        }
        await Promise.all(promises);
        const end = Date.now();
        logger.info({
            message: `Finished extract for ${successCount} views`,
            successCount,
            failCount: event.Records.length - successCount,
            elapsedTime: `${end - begin}ms`,
        });
    } catch (e) {
        logger.error(
            JSON.stringify({
                message: 'Extract insights failed',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }),
        );
        throw e;
    }

    return 'got it!';
};
