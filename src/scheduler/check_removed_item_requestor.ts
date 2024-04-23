import { asClass, asValue } from 'awilix';
import { Context, ScheduledEvent } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { IDatasource } from '../data/datasource_aurora';
import { SnsClient } from '../notifications/sns_client';
export interface ICheckRemovedItemRequestor {
    sendRequests(): Promise<string>;
}

export class CheckRemovedItemRequestor
    extends SnsClient
    implements ICheckRemovedItemRequestor
{
    private datasource: IDatasource;

    constructor(opts: any) {
        super(opts);
        this.datasource = opts.datasource;
    }

    async sendRequests(): Promise<string> {
        const datasources = (await this.datasource.getAll()).filter(
            (datasource) => datasource.enabled && datasource.runType,
        );
        this.logger.info(
            'sending check removed items requests to datasources======>%o',
            datasources.map((datasource) => ({
                org: datasource.orgId,
                datasourceId: datasource.datasourceId,
            })),
        );
        for (const item of datasources) {
            this.logger.debug(
                `Processing item ${item.orgId}#${item.datasourceId} for datasource type ${item.datasourceType}`,
            );
            const message = {
                TopicArn: `${this.topicPrefix}:check-removed-items`,
                Message: JSON.stringify(item),
                MessageAttributes: {
                    orgId: {
                        DataType: 'String',
                        StringValue: item.orgId,
                    },
                    datasourceId: {
                        DataType: 'String',
                        StringValue: item.datasourceId,
                    },
                    datasourceType: {
                        DataType: 'String',
                        StringValue: item.datasourceType,
                    },
                },
            };

            this.logger.trace(
                'CheckRemovedItemRequestor about to publish: %o',
                message,
            );

            const result = await this.client.publish(message).promise();
        }
        this.logger.debug(
            'DataExtractRequestor: %i requests sent',
            datasources.length,
        );
        return 'Sending off check and remove requests';
    }
}

export const CheckRemovedItem = async (
    _event: ScheduledEvent,
    context: Context,
) => {
    const container = await getDependencyInjectionContainer();
    container.register({
        lambdaContext: asValue(context),
        checkRemovedItemRequestor: asClass(CheckRemovedItemRequestor),
    });

    try {
        await container.cradle.checkRemovedItemRequestor.sendRequests();
    } catch (e) {
        container.cradle.logger.error('Failed: ' + e.message + '\n' + e.stack);
        context.fail(e.message);
    }
    context.succeed({ result: 'got it!' });
};
