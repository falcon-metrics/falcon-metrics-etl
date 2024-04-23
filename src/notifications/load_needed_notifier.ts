import { SnsClient } from './sns_client';
import {
    StandardStateItem,
    StandardSnapshotItem,
    CustomFieldItem,
} from '../workitem/interfaces';

const NOTIFICATION_TOPIC_NAME_LOADSTATE = 'load-stateitem';
const NOTIFICATION_TOPIC_NAME_LOADSNAPSHOT = 'SnapshotItemTopic';
const NOTIFICATION_TOPIC_NAME_LOADCUSTOMFIELD = 'load-customfields';

export interface ILoadNeededNotifier {
    notify(
        orgId: string,
        datasourceId: string,
        item: StandardStateItem | StandardSnapshotItem | Array<CustomFieldItem>,
    ): Promise<string>;
}

export class StateLoadNeededNotifier
    extends SnsClient
    implements ILoadNeededNotifier {
    async notify(
        orgId: string,
        datasourceId: string,
        item: StandardStateItem,
    ): Promise<string> {
        const message = {
            TopicArn: `${this.topicPrefix}:${NOTIFICATION_TOPIC_NAME_LOADSTATE}`,
            Message: JSON.stringify(item),
            MessageAttributes: {
                orgId: {
                    DataType: 'String',
                    StringValue: orgId,
                },
                datasourceId: {
                    DataType: 'String',
                    StringValue: datasourceId,
                },
            },
        };

        this.logger.trace('LoadNeededNotifier about to publish: %o', message);

        const result = await this.client.publish(message).promise();

        this.logger.trace(
            'LoadNeededNotifier publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }
}

export class SnapshotLoadNeededNotifier
    extends SnsClient
    implements ILoadNeededNotifier {
    async notify(
        orgId: string,
        datasourceId: string,
        item: StandardSnapshotItem,
    ): Promise<string> {
        const message = {
            TopicArn: `${this.topicPrefix}:${NOTIFICATION_TOPIC_NAME_LOADSNAPSHOT}`,
            Message: JSON.stringify(item),
            MessageAttributes: {
                orgId: {
                    DataType: 'String',
                    StringValue: orgId,
                },
                datasourceId: {
                    DataType: 'String',
                    StringValue: datasourceId,
                },
            },
        };

        this.logger.trace('LoadNeededNotifier about to publish: %o', message);

        const result = await this.client.publish(message).promise();

        this.logger.trace(
            'LoadNeededNotifier publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }
}

export class CustomFieldLoadNeededNotifier
    extends SnsClient
    implements ILoadNeededNotifier {
    async notify(
        orgId: string,
        datasourceId: string,
        customFields: Array<CustomFieldItem>,
    ): Promise<string> {
        const message = {
            TopicArn: `${this.topicPrefix}:${NOTIFICATION_TOPIC_NAME_LOADCUSTOMFIELD}`,
            Message: JSON.stringify(customFields),
            MessageAttributes: {
                orgId: {
                    DataType: 'String',
                    StringValue: orgId,
                },
                datasourceId: {
                    DataType: 'String',
                    StringValue: datasourceId,
                },
            },
        };

        this.logger.trace('LoadNeededNotifier about to publish: %o', message);

        const result = await this.client.publish(message).promise();

        this.logger.trace(
            'LoadNeededNotifier publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }
}
