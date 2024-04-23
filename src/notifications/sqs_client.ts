import AWS, { AWSError } from 'aws-sdk';
import { Logger } from 'pino';
import { isDev } from '../utils/dev';
import { v4 } from 'uuid';
export const QueueName = {
    'process-revisions': 'ProcessRevisionQueue',
};
export const enum QueueType {
    PROCESS_REVISIONS = 'process-revisions',
}
export interface ISqsClient {
    sendMessageToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Key: string,
    ): Promise<AWS.SQS.SendMessageResult>;
    sendMessageBatchToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Keys: string[],
    ): Promise<AWS.SQS.SendMessageBatchResult>;
    sendMessageToQueue(
        queueName: string,
        message: any,
    ): Promise<AWS.SQS.SendMessageResult>;
    sendMessageToFIFOQueue(
        queueName: string,
        message: Record<any, any>,
        /**
         * From AWS documentation
         *
         * This required field enables multiple message groups within a single queue.
         * If you do not need this functionality, provide the same MessageGroupId value
         * for all messages. Messages within a single group are processed in a FIFO fashion.
         */
        messageGroupId: string,
    ): Promise<AWS.SQS.SendMessageResult>;
}
export class SqsClient implements ISqsClient {
    private sqs: AWS.SQS;
    private logger: Logger;
    private queuePrefix: string;
    constructor(opts: { logger: Logger }) {
        this.logger = opts.logger;
        this.sqs = new AWS.SQS();
        this.queuePrefix = process.env.IS_OFFLINE
            ? 'http://localhost:9324/queue'
            : 'https://sqs.ap-southeast-2.amazonaws.com/906466243975';
    }
    private getQueueName(queueType: QueueType): string {
        return QueueName[queueType];
    }
    private async sendMessageWrapper(
        params: AWS.SQS.SendMessageRequest,
    ): Promise<AWS.SQS.SendMessageResult> {
        const loggerInstance = this.logger;
        loggerInstance.info({
            message: 'Sending to sqs',
            params,
        });
        try {
            const result = await this.sqs.sendMessage(params).promise();
            if (result.$response.error) {
                loggerInstance.error({
                    message: 'Error sending to sqs',
                    errorMessage: result.$response.error,
                });
                throw result.$response.error;
            }
            if (!result.$response.data) {
                throw new Error(
                    'No data in the SQS response. Something went wrong',
                );
            }
            loggerInstance.info({
                message: 'Sent to sqs',
                params,
            });
            return result.$response.data;
        } catch (e) {
            loggerInstance.error({
                message: 'Error sending to sqs',
                error: e,
            });
            throw e;
        }
    }
    private async sendMessageBatchWrapper(
        params: AWS.SQS.SendMessageBatchRequest,
    ): Promise<AWS.SQS.SendMessageBatchResult> {
        const loggerInstance = this.logger;
        loggerInstance.info({
            message: 'Sending to sqs',
            params,
        });
        try {
            const result = await this.sqs.sendMessageBatch(params).promise();
            if (result.$response.error) {
                loggerInstance.error({
                    message: 'Error sending to sqs',
                    errorMessage: result.$response.error,
                });
                throw result.$response.error;
            }
            if (!result.$response.data) {
                throw new Error(
                    'No data in the SQS response. Something went wrong',
                );
            }
            loggerInstance.info({
                message: 'Sent to sqs',
                params,
            });
            return result.$response.data;
        } catch (e) {
            loggerInstance.error({
                message: 'Error sending to sqs',
                error: e,
            });
            throw e;
        }
    }
    /**
     * A generic send to queue with custom queue name
     * @param queueName
     * @param message
     * @returns
     */
    async sendMessageToQueue(queueName: string, message: any) {
        const params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
        };
        try {
            const result = await this.sendMessageWrapper(params);
            return result;
        } catch (error) {
            const awsError = error as AWSError;
            this.logger.info({
                message: 'Error sending to sqs',
                errorMessage: JSON.stringify(awsError),
            });
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${
                    awsError.message
                }`,
            );
        }
    }
    /**
     * Send a message to a FIFO queue
     */
    async sendMessageToFIFOQueue(
        queueName: string,
        message: Record<any, any>,
        /**
         * From AWS documentation
         *
         * This required field enables multiple message groups within a single queue.
         * If you do not need this functionality, provide the same MessageGroupId value
         * for all messages. Messages within a single group are processed in a FIFO fashion.
         */
        messageGroupId: string,
    ) {
        const params: {
            MessageBody: string;
            QueueUrl: string;
            MessageGroupId?: string;
        } = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
        };
        if (!isDev) {
            params.MessageGroupId = messageGroupId;
        }
        try {
            const result = await this.sendMessageWrapper(params);
            return result;
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${
                    awsError.message
                }`,
            );
        }
    }
    /**
     * A specific send to queue message for datasource
     * @param datasourceType
     * @param s3Key
     * @returns void
     */
    async sendMessageToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Key: string,
    ): Promise<AWS.SQS.SendMessageResult> {
        const queueName = this.getQueueName(datasourceType);
        const message = {
            s3Key,
        };

        const params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
        };
        try {
            return await this.sendMessageWrapper(params);
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${
                    awsError.message
                }`,
            );
        }
    }

    /**
     * A specific send to queue message for datasource
     * @param datasourceType
     * @param s3Keys
     * @returns void
     */
    async sendMessageBatchToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Keys: string[],
    ): Promise<AWS.SQS.SendMessageBatchResult> {
        const queueName = this.getQueueName(datasourceType);
        const QueueUrl = `${this.queuePrefix}/${queueName}`;
        const params: AWS.SQS.SendMessageBatchRequest = {
            QueueUrl,
            Entries: s3Keys.map((s3Key) => ({
                Id: v4(),
                MessageBody: JSON.stringify({ s3Key }),
            })),
        };
        try {
            return await this.sendMessageBatchWrapper(params);
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending batch message ${JSON.stringify(params)}, ${
                    awsError.message
                }`,
            );
        }
    }
}
