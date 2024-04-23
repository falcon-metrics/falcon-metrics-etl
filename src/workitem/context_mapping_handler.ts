import { asClass, asValue } from 'awilix';
import { Context, SNSEvent, SQSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { array, date, object, string } from 'yup';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { LogTags } from '../utils/log_tags';
import { ContextWorkitemMapProcessorAurora } from './context_workitem_map_processor_aurora';
import { S3Client } from './s3_client';

/**
 * @deprecated
 */
export const deletePreviousWorkItemMapContext = async (
    event: SNSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();
    const logger: Logger = container.cradle.logger;

    logger.trace('[AURORA] Got message: %o', event);

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(ContextWorkitemMapProcessorAurora),
    });

    try {
        for (const eventRecord of event.Records) {
            const payload = eventRecord.Sns;
            const extractRunAt = DateTime.fromISO(payload.Message);

            const orgId = payload.MessageAttributes.orgId.Value;
            const datasourceId = payload.MessageAttributes.datasourceId.Value;

            logger.info({
                message: 'Received notification to delete',
                orgId: orgId,
                datasourceId: datasourceId,
                deleteBefore: extractRunAt.toUTC().toISO(),
            });

            try {
                await container.cradle.processor.processDelete(
                    orgId,
                    datasourceId,
                    extractRunAt,
                );
            } catch (e) {
                const errorMessage = (e as Error).message;
                const errorStack = (e as Error).stack;
                logger.error(
                    JSON.stringify({
                        message: 'Delete context failed',
                        orgId,
                        datasourceId,
                        deleteBefore: extractRunAt.toUTC().toISO(),
                        errorMessage,
                        errorStack,
                    }),
                );
                throw e;
            }
        }
    } catch (e) {
        logger.error(
            '[CONTEXT MAPPING] Failed: ' +
                (e as Error).message +
                '\n' +
                (e as Error).stack,
        );
        throw e;
    }

    return 'Delete successful';
};

/**
 * Item on the ContextWorkItemMappingQueue
 */
export type QueueItem = {
    orgId: string;
    contextId: string;
    workItemIdKey: string;
    datasourceId: string;
    extractRunAt: string;
};

/**
 * Validate payload with yup
 */
export const isValid = (payload: Record<any, any>) => {
    const schema = object({
        orgId: string().required(),
        contextId: string().required(),
        datasourceId: string().required(),
        extractRunAt: date().required(),
        workItemIdKey: string().required(),
    });
    return schema.isValidSync(payload);
};

export const mapWorkitemsToContextAurora = async (
    event: SQSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();
    const logger: Logger | undefined = container?.cradle?.logger;

    logger?.trace('[AURORA] Got message: %o', event);

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(ContextWorkitemMapProcessorAurora),
        itemUploader: asClass(S3Client),
    });

    try {
        for (const eventRecord of event.Records) {
            const payload = eventRecord.body;
            const parsed = JSON.parse(payload);

            if (!isValid(parsed)) {
                throw new Error('Invalid payload');
            }
            const {
                orgId,
                datasourceId,
                workItemIdKey,
                contextId,
                extractRunAt,
            } = parsed as QueueItem;

            logger?.info({
                message: 'Starting processing',
                orgId,
                contextId,
                datasourceId,
                workItemIdKey,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
            });

            const d = DateTime.fromISO(extractRunAt);

            await (
                container.cradle.processor as ContextWorkitemMapProcessorAurora
            ).process(orgId, datasourceId, contextId, workItemIdKey, d);
        }
    } catch (e) {
        logger?.error({
            message: 'Context mapping failed',
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
            event,
        });
        throw e;
    }

    return 'Load successful';
};
