import { asClass, AwilixContainer } from 'awilix';
import { Context, SQSEvent } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { NotificationsData } from '../flomatika_notifications/data';
import { EvaluateThresholdSubscriptions } from '../flomatika_notifications/process/evaluate_threshold_subscription';
import { ThresholdSubscriptionMessage } from '../flomatika_notifications/types';
import { SqsClient } from '../notifications/sqs_client';
import { IEvaluateThresholdSubscriptionProcess } from '../process_interfaces/evaluate_threshold_subscription_process_interface';
import { Auth0Secret } from '../secrets/auth0_secret';

const registerEvaluator = (container: AwilixContainer) => {
    container.register({
        secrets: asClass(Auth0Secret),
        notificationData: asClass(NotificationsData),
        sqsClient: asClass(SqsClient),
        evaluationProcessor: asClass(EvaluateThresholdSubscriptions),
    });
};
export const process = async (
    event: SQSEvent,
    _context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();
    try {
        registerEvaluator(container);
        for (const record of event.Records) {
            const messageBody = JSON.parse(
                record.body,
            ) as ThresholdSubscriptionMessage;
            await (
                container.cradle
                    .evaluationProcessor as IEvaluateThresholdSubscriptionProcess
            ).process(messageBody);
        }
        return 'ok';
    } catch (error) {
        console.log(error);
        container.cradle.logger.error('evaluate subscriptions failed');
        return 'no';
    }
};
