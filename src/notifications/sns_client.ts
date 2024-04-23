import AWS from 'aws-sdk';
import { Context } from 'aws-lambda';
import { Logger } from 'pino';

class VoidLogger {
    static log(message: string) {
        //no-op logger to stop the blank line noise in logging output
        //otherwise the logger isn't respecting the logging level
    }
}

export abstract class SnsClient {
    protected client: AWS.SNS;
    protected topicPrefix: string;
    protected logger: Logger;

    constructor(opts: any) {
        let clientOptions: AWS.SNS.ClientConfiguration;

        this.logger = opts.logger;
        this.logger = opts.logger;

        if (process.env.IS_OFFLINE) {
            clientOptions = {
                region: 'ap-southeast-2',
                endpoint: 'http://0.0.0.0:4002',
            };
            this.topicPrefix = `arn:aws:sns:${
                process.env.AWS_DEFAULT_REGION! || 'ap-southeast-2'
            }:123456789012`;
        } else {
            clientOptions = {};

            // At this point we're making the assumption that the sns queue is in the same region/account as the lambda
            const arnParts = (
                opts.lambdaContext as Context
            ).invokedFunctionArn.split(':');
            arnParts[2] = 'sns';
            this.topicPrefix = arnParts.slice(0, 5).join(':');
        }

        clientOptions.logger = VoidLogger;
        this.client = new AWS.SNS(clientOptions);
    }
}
