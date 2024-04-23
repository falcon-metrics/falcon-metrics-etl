import { FlomatikaNotification } from '../data';
import {
    ThresholdNotificationSubscription,
    GroupedThresholdSubscriptionMessage,
} from '../types';

export const groupSubscriptionsByApiCall = (
    subscriptions: ThresholdNotificationSubscription[],
    notification: FlomatikaNotification,
): GroupedThresholdSubscriptionMessage => {
    const formatKey = (subscription: ThresholdNotificationSubscription) => {
        const keyArr: string[] = [];
        keyArr.push(subscription.orgId);
        keyArr.push(subscription.obeyaRoomId);
        keyArr.push(subscription.queryParameters || '');
        return keyArr.join('_');
    };
    const groupedMessages: GroupedThresholdSubscriptionMessage = {};
    subscriptions.forEach((subscription) => {
        const key = formatKey(subscription);
        if (!groupedMessages[key]) {
            groupedMessages[key] = {
                orgId: subscription.orgId,
                obeyaRoomId: subscription.obeyaRoomId,
                queryParameter: subscription.queryParameters,
                emailTemplateName: notification.emailTemplateName,
            };
        }
    });
    return groupedMessages;
};
