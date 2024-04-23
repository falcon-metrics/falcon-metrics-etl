import { DateTime } from 'luxon';
import { SnsClient } from './sns_client';

const NOTIFICATION_TOPIC_NAME_CONTEXTMAPPING = 'context-mapitems';
const NOTIFICATION_TOPIC_NAME_CONTEXTMAPPING_DELETE =
    'context-mapitems-delete';

export interface IContextMappingNotifier {
    /**
     * @deprecated
     *
     * Deleting asynchronously causes race conditions. Hence deprecating this
     */
    notifyDelete(
        orgId: string,
        datasourceId: string,
        deleteBeforeDate: DateTime,
    ): Promise<string>;

    notify(
        orgId: string,
        datasourceId: string,
        contextId: string,
        item: Array<string>,
        extractRunAt?: DateTime,
    ): Promise<string>;
}

export class ContextMappingNotifier
    extends SnsClient
    implements IContextMappingNotifier {
    async notifyDelete(
        orgId: string,
        datasourceId: string,
        deleteBeforeDate: DateTime,
    ): Promise<string> {
        const message = {
            TopicArn: `${this.topicPrefix}:${NOTIFICATION_TOPIC_NAME_CONTEXTMAPPING_DELETE}`,
            Message: deleteBeforeDate.toUTC().toISO()!,
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

        this.logger.trace(
            'ContextMappingNotifier [delete] about to publish: %o',
            message,
        );

        const result = await this.client.publish(message).promise();

        this.logger.info({
            message: 'Published notification for context-workitem maps delete',
            orgId,
            datasourceId,
            notificationMessage: message,
            publishResult: JSON.parse(JSON.stringify(result)),
        });

        this.logger.trace(
            'ContextMappingNotifier [delete] publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }

    async notify(
        orgId: string,
        datasourceId: string,
        contextId: string,
        item: Array<string>,
        extractRunAt?: DateTime,
    ): Promise<string> {
        const message = {
            TopicArn: `${this.topicPrefix}:${NOTIFICATION_TOPIC_NAME_CONTEXTMAPPING}`,
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
                contextId: {
                    DataType: 'String',
                    StringValue: contextId,
                },
                extractRunAt: {
                    DataType: 'String',
                    StringValue: extractRunAt?.toUTC().toISO() ?? undefined,
                },
            },
        };

        this.logger.trace(
            'ContextMappingNotifier about to publish: %o',
            message,
        );

        const result = await this.client.publish(message).promise();

        if (result.$response.error) {
            this.logger.error(
                JSON.stringify({
                    message: 'Error when publishing notification to SNS',
                    error: result.$response.error,
                    result,
                    orgId,
                }),
            );
        }

        this.logger.trace(
            'ContextMappingNotifier publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }
}
