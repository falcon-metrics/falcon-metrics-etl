import { Context, SNSEvent, SQSEvent } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { asValue, asClass, Lifetime } from 'awilix';
import { SnapshotLoadProcessorAurora } from './snapshot_load_processor_aurora';
import {
    CustomFieldItem,
    StandardSnapshotItem,
    StandardStateItem,
} from './interfaces';
import { StateLoadProcessorAurora } from './state_load_processor_aurora';
import { CustomFieldLoadProcessor } from './custom_field_load_processor';

const ignoreNullFields = (
    _key: string,
    value: unknown,
): unknown | undefined => {
    if (value === null) return undefined;

    return value;
};

export const loadStateAurora = async (
    event: SNSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();

    container.cradle.logger.trace('[loadStateAurora] Got message: %o', event);

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(StateLoadProcessorAurora),
    });

    try {
        for (const eventRecord of event.Records) {
            const payload = eventRecord.Sns;
            const item: StandardStateItem = JSON.parse(payload.Message);

            const orgId = payload.MessageAttributes.orgId.Value;
            const datasourceId = payload.MessageAttributes.datasourceId.Value;

            await (
                container.cradle.processor as StateLoadProcessorAurora
            ).process(orgId, datasourceId, item);
        }
    } catch (e) {
        container.cradle.logger.error('Failed: ' + e.message + '\n' + e.stack);
        throw e;
    }

    return '[STATE] [AURORA] Load successful';
};

/**
 * @deprecated
 */
export const loadSnapshotAurora = async (
    event: SNSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();

    container.cradle.logger.trace(
        '[loadSnapshotAurora] Got message: %o',
        event,
    );

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(SnapshotLoadProcessorAurora),
    });
    let duration: number;
    let orgId;
    try {
        const start = new Date().getTime();
        for (const eventRecord of event.Records) {
            const payload = eventRecord.Sns;
            const item: StandardSnapshotItem = JSON.parse(payload.Message);

            orgId = payload.MessageAttributes.orgId.Value;
            const datasourceId = payload.MessageAttributes.datasourceId.Value;
            if (!orgId || !datasourceId) {
                container.cradle.logger.error(
                    `[SNAPSHOT] Invalid snapshot with payload ${JSON.stringify(
                        payload.Message,
                    )}`,
                );
                continue;
            }

            await (
                container.cradle.processor as SnapshotLoadProcessorAurora
            ).process(orgId, datasourceId, item);
        }
        const finished = new Date().getTime();
        duration = finished - start;
    } catch (e) {
        container.cradle.logger.error(
            `[SNAPSHOT][ERROR][${orgId ? orgId : 'undefined orgId'}] Failed: ' + e.message + '\n' + e.stack`,
        );
        throw e;
    }

    return '[SNAPSHOT] [AURORA] [SNS] load successful';
};

export const loadSnapshotAuroraSQS = async (
    event: SQSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();

    container.cradle.logger.trace(
        '[loadSnapshotAuroraSQS] Got message: %o',
        event,
    );

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(SnapshotLoadProcessorAurora, {
            lifetime: Lifetime.SCOPED,
        }),
    });

    try {
        for (const eventRecord of event.Records) {
            const body = JSON.parse(eventRecord.body, ignoreNullFields);
            let item: StandardSnapshotItem;
            let orgId: string;
            let datasourceId: string;

            //production and sqs offline (local) modes, have different message formats
            //this is because subscribing to the SNS queue from SQS doesn't work
            //locally unless rawMessageDelivery is enabled (which is in serverless.yml)
            if (body.Message) {
                //in production, the item is at eventRecord.body.Message (Message is the item object)
                item = JSON.parse(body.Message, ignoreNullFields);
                orgId = body.MessageAttributes.orgId.Value;
                datasourceId = body.MessageAttributes.datasourceId.Value;
            } else {
                //in offline SQS
                item = body as StandardSnapshotItem;
                orgId = eventRecord.messageAttributes.orgId.stringValue ?? '';
                datasourceId =
                    eventRecord.messageAttributes.datasourceId.stringValue ??
                    '';
            }

            if (!orgId || !datasourceId) {
                container.cradle.logger.error(
                    '[SNAPSHOT] Invalid snapshot with payload: %o',
                    eventRecord,
                );
                return '[SNAPSHOT] [AURORA] [SQS] load failed';
            }

            await (
                container.cradle.processor as SnapshotLoadProcessorAurora
            ).process(orgId, datasourceId, item);
        }
    } catch (e) {
        container.cradle.logger.error(e);
        throw e;
    }

    return '[SNAPSHOT] [AURORA] [SQS] load successful';
};

export const loadCustomFields = async (
    event: SNSEvent,
    context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();

    container.cradle.logger.trace('[loadCustomFields] Got message: %o', event);

    container.register({
        lambdaContext: asValue(context),
        processor: asClass(CustomFieldLoadProcessor),
    });

    try {
        for (const eventRecord of event.Records) {
            const payload = eventRecord.Sns;
            const customFields: Array<CustomFieldItem> = JSON.parse(
                payload.Message,
                (_key: string, value: unknown): unknown | undefined => {
                    if (value === null) return undefined;

                    return value;
                },
            );

            const orgId = payload.MessageAttributes.orgId.Value;
            const datasourceId = payload.MessageAttributes.datasourceId.Value;

            await (
                container.cradle.processor as CustomFieldLoadProcessor
            ).process(orgId, datasourceId, customFields);
        }
    } catch (e) {
        container.cradle.logger.error('Failed: ' + e.message + '\n' + e.stack);
        throw e;
    }

    return '[CUSTOMFIELD] [AURORA] load successful';
};
