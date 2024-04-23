import { Logger } from 'pino';
import { NotificationsModel } from '../data/models/NotificationsModel';
import { Filterable, Sequelize, WhereOptions } from 'sequelize';
import { ThresholdNotificationSubscriptionModel } from '../data/models/ThresholdNotificationSubscriptionModel';
import { ObeyaRoom, ThresholdNotificationSubscription, User } from './types';
import { UserModel } from '../data/models/UserModel';
import { ObeyaRoomModel } from '../data/models/ObeyaRoomModel';

export type FlomatikaNotification = {
    id: number;
    type: string;
    name: string;
    resource: string;
    active: boolean;
    emailTemplateName: string;
};

export interface INotificationData {
    getAllNotifications(): Promise<FlomatikaNotification[]>;
    getAllNotificationSubscriptions(
        notification: FlomatikaNotification,
    ): Promise<ThresholdNotificationSubscription[]>;
    getAllSubscriptionsForObeya(
        orgId: string,
        obeyaRoomId: string,
    ): Promise<ThresholdNotificationSubscription[]>;
    getUserInfo(orgId: string, userId: string): Promise<User>;
    getObeyaRoom(obeyaRoomId: string, orgId: string): Promise<ObeyaRoom>;
}

export class NotificationsData implements INotificationData {
    private logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }
    async getAllNotifications(): Promise<FlomatikaNotification[]> {
        const aurora = await this.database;
        const notificationModel = NotificationsModel(aurora);
        const notificationItems = await notificationModel.findAll({
            where: {
                active: true,
            },
            raw: true,
        });
        const notifications: FlomatikaNotification[] = [];
        notificationItems.forEach((notificationItem) => {
            notifications.push(
                notificationItem as unknown as FlomatikaNotification,
            );
        });
        return notifications;
    }
    async getSubscriptions(
        where: WhereOptions,
    ): Promise<ThresholdNotificationSubscription[]> {
        const aurora = await this.database;
        const thresholdNotificationSubscriptionModel =
            ThresholdNotificationSubscriptionModel(aurora);
        const subscriptionItems =
            await thresholdNotificationSubscriptionModel.findAll({
                where,
                raw: true,
            });
        const subscriptions: ThresholdNotificationSubscription[] = [];
        subscriptionItems.forEach((subscriptionItems) => {
            subscriptions.push(
                subscriptionItems as unknown as ThresholdNotificationSubscription,
            );
        });
        return subscriptions;
    }
    async getAllNotificationSubscriptions(
        notification: FlomatikaNotification,
    ): Promise<ThresholdNotificationSubscription[]> {
        return await this.getSubscriptions({
            notificationId: notification.id,
            active: true,
        });
    }
    async getAllSubscriptionsForObeya(
        orgId: string,
        obeyaRoomId: string,
    ): Promise<ThresholdNotificationSubscription[]> {
        return await this.getSubscriptions({
            obeyaRoomId,
            orgId,
            active: true,
        });
    }
    async getUserInfo(orgId: string, userId: string): Promise<User> {
        const aurora = await this.database;
        const userModel = UserModel(aurora);
        const user = (await userModel.findOne({
            where: {
                orgId,
                userId,
            },
            raw: true,
        })) as unknown;
        return user as User;
    }
    async getObeyaRoom(obeyaRoomId: string, orgId: string): Promise<ObeyaRoom> {
        const aurora = await this.database;
        const obeyaRoomModel = ObeyaRoomModel(aurora);
        const user = (await obeyaRoomModel.findOne({
            where: {
                orgId,
                roomId: obeyaRoomId,
            },
            raw: true,
        })) as unknown;
        return user as ObeyaRoom;
    }
}
