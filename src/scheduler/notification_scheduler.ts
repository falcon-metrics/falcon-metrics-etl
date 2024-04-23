//schedule the notifications
//find subscriptions

import { asClass, AwilixContainer } from 'awilix';
import { ScheduledEvent, Context } from 'aws-lambda';
import { Logger } from 'pino';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import {
    INotificationData,
    NotificationsData,
} from '../flomatika_notifications/data';
import {
    GroupedThresholdSubscriptionMessage,
    ThresholdSubscriptionMessage,
} from '../flomatika_notifications/types';
import { groupSubscriptionsByApiCall } from '../flomatika_notifications/utils/utils';
import { ThresholdNotificationEvaluatorQueue } from '../flomatika_notifications/values';
import { ISqsClient, SqsClient } from '../notifications/sqs_client';

export interface INotificationRequestor {
    requestNotifications(): Promise<void>;
}

export class NotificationRequestor implements INotificationRequestor {
    private logger: Logger;
    private notificationData: INotificationData;
    private sqsClient: ISqsClient;
    constructor(opt: {
        logger: Logger;
        notificationData: INotificationData;
        sqsClient: ISqsClient;
    }) {
        this.logger = opt.logger;
        this.notificationData = opt.notificationData;
        this.sqsClient = opt.sqsClient;
    }
    async requestNotifications() {
        const notifications = await this.notificationData.getAllNotifications();
        //for each notification find subscriptions
        for (const notification of notifications) {
            //for each notification find subscriptions
            const subscriptions =
                await this.notificationData.getAllNotificationSubscriptions(
                    notification,
                );
            //Send message for each: obeya room, orgId -> so only one api call needed
            const groupedMessages: GroupedThresholdSubscriptionMessage =
                groupSubscriptionsByApiCall(subscriptions, notification);
            await Promise.all(
                Object.keys(groupedMessages).map(async (messageKey) => {
                    await this.sendMessageToEvaluator(
                        groupedMessages[messageKey],
                    );
                }),
            );
        }

        //invoke each group (send to sqs)
    }
    async sendMessageToEvaluator(
        message: ThresholdSubscriptionMessage,
    ): Promise<AWS.SQS.SendMessageResult> {
        return await this.sqsClient.sendMessageToQueue(
            ThresholdNotificationEvaluatorQueue,
            message,
        );
    }
}
const registerExtractor = (container: AwilixContainer) => {
    container.register({
        notificationData: asClass(NotificationsData),
        notificationRequestor: asClass(NotificationRequestor),
        sqsClient: asClass(SqsClient),
    });
};
export const kickOffNotifications = async (_event: ScheduledEvent) => {
    const container = await getDependencyInjectionContainer();
    try {
        registerExtractor(container);

        await (
            container.cradle.notificationRequestor as INotificationRequestor
        ).requestNotifications();
    } catch (e) {
        container.cradle.logger.error('Kick off notification failed');
        throw e;
    }

    return 'got it!';
};
