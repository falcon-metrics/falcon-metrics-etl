import { ScheduledEvent, Context as LambdaContext } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { asValue, asClass } from 'awilix';
import { DataExtractRequestor } from './data_extract_requestor';
import {
    ExtractKickoffNotifier,
    ExtractType,
} from '../notifications/extract_kickoff_notifier';
import { Context } from '../data/context_aurora';
import { ContextsQueuer } from '../handlers/contexts_queuer';
import { SqsClient } from '../notifications/sqs_client';
import { Logger } from 'pino';

export const kickOffExtractContexts = async (
    _event: ScheduledEvent,
    context: LambdaContext,
) => {
    const container = await getDependencyInjectionContainer();
    container.register({
        lambdaContext: asValue(context),
        context: asClass(Context),
        contextsQueuer: asClass(ContextsQueuer),
        sqsClient: asClass(SqsClient),
    });
    const logger: Logger = container.cradle.logger;
    const queuer: ContextsQueuer = container.cradle.contextsQueuer;
    try {
        await queuer.queueContextsForExtract();
    } catch (e) {
        logger.error({
            message: 'Failed to schedule context extraction',
            errorMessage: e.message,
            errorStack: e.stack,
        });
        throw e;
    }
    context.succeed({ result: 'got it!' });
};

export const kickOffExtractStates = async (
    _event: ScheduledEvent,
    context: LambdaContext,
) => {
    const container = await getDependencyInjectionContainer();
    container.register({
        lambdaContext: asValue(context),
        dataExtractRequestor: asClass(DataExtractRequestor),
        extractKickoffNotifier: asClass(ExtractKickoffNotifier),
    });

    try {
        await container.cradle.dataExtractRequestor.sendRequestsToExtract(
            ExtractType.EXTRACT_STATES,
        );
    } catch (e) {
        container.cradle.logger.error('Failed: ' + e.message + '\n' + e.stack);
        context.fail(e.message);
    }
    context.succeed({ result: 'invoke local got it!' });
};

export const kickOffExtractSprints = async (
    _event: ScheduledEvent,
    context: LambdaContext,
) => {
    const container = await getDependencyInjectionContainer();
    container.register({
        lambdaContext: asValue(context),
        dataExtractRequestor: asClass(DataExtractRequestor),
        extractKickoffNotifier: asClass(ExtractKickoffNotifier),
    });

    try {
        await container.cradle.dataExtractRequestor.sendRequestsToExtract(
            ExtractType.EXTRACT_SPRINTS,
        );
    } catch (e) {
        container.cradle.logger.error('Failed: ' + e.message + '\n' + e.stack);
        context.fail(e.message);
    }

    context.succeed({
        result: 'Successfully sent the request to extract sprints',
    });
};
