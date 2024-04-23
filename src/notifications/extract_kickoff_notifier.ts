import { SnsClient } from './sns_client';

export enum ExtractType {
    EXTRACT_STATES,
    EXTRACT_CONTEXTS,
    EXTRACT_SPRINTS,
}

export interface IExtractKickoffNotifier {
    notify(
        extractType: ExtractType,
        orgId: string,
        datasourceId: string,
        datasourceType: string,
    ): Promise<string>;
}

export class ExtractKickoffNotifier
    extends SnsClient
    implements IExtractKickoffNotifier
{
    async notify(
        extractType: ExtractType,
        orgId: string,
        datasourceId: string,
        datasourceType: string,
    ): Promise<string> {
        let notificationName;
        switch (extractType) {
            case ExtractType.EXTRACT_STATES:
                notificationName = 'flomatika-extract-states';
                break;
            case ExtractType.EXTRACT_CONTEXTS:
                notificationName = 'flomatika-extract-contexts';
                break;
            case ExtractType.EXTRACT_SPRINTS:
                notificationName = 'flomatika-extract-sprints';
                break;
        }
        if (!notificationName) {
            throw Error('Cannot find extract type');
        }
        const topicArn = `${this.topicPrefix}:${notificationName}`;
        const message = {
            TopicArn: topicArn,
            Message: JSON.stringify({
                orgId: orgId,
                datasourceId: datasourceId,
                datasourceType: datasourceType,
            }),
        };

        this.logger.trace(
            `ExtractKickoffNotifier about to publish to ${notificationName}: %o`,
            message,
        );

        const result = await this.client.publish(message).promise();

        this.logger.trace(
            'ExtractKickoffNotifier publish result: %o',
            result.MessageId,
        );

        return result.MessageId!;
    }
}
