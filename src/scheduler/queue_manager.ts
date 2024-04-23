import {
    CreateEventSourceMappingCommand,
    EventSourceMappingConfiguration,
    FunctionConfiguration,
    LambdaClient,
    ListEventSourceMappingsCommand,
    ListFunctionsCommand,
    UpdateEventSourceMappingCommand,
} from '@aws-sdk/client-lambda';
import {
    CreateQueueCommand,
    GetQueueAttributesCommand,
    ListQueuesCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';

type ConfigOptions = { maximumConcurrency: number; batchSize: number };

export class QueueManager {
    private sqs = new SQSClient();
    private lambda = new LambdaClient();

    async getQueueUrl(queueName: string): Promise<string | undefined> {
        try {
            const listQueuesCommand = new ListQueuesCommand({
                QueueNamePrefix: queueName,
            });
            const listQueuesResponse = await this.sqs.send(listQueuesCommand);
            const queueUrl = listQueuesResponse.QueueUrls?.find((url) =>
                url?.includes(queueName),
            );
            return queueUrl;
        } catch (error) {
            console.error('Error checking if queue exists:', error);
            throw error;
        }
    }

    async createQueue(queueName: string): Promise<string> {
        try {
            const createQueueCommand = new CreateQueueCommand({
                QueueName: queueName,
                Attributes: {
                    // 16 minutes * 60 seconds
                    // 16 minutes because the lambda timeout is 15 minutes
                    VisibilityTimeout: (16 * 60).toString(),
                },
            });
            const createQueueResponse = await this.sqs.send(createQueueCommand);
            if (!createQueueResponse.QueueUrl) {
                throw new Error('createQueueResponse.QueueUrl is undefined');
            }
            return createQueueResponse.QueueUrl;
        } catch (error) {
            console.error('Error creating queue :', queueName, error);

            throw error;
        }
    }

    async getQueueArn(queueUrl: string): Promise<string> {
        try {
            const getQueueAttributesCommand = new GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ['QueueArn'],
            });
            const queueAttributesResponse = await this.sqs.send(
                getQueueAttributesCommand,
            );

            if (!queueAttributesResponse.Attributes?.QueueArn)
                throw new Error(
                    'queueAttributesResponse.Attributes?.QueueArn is undefined',
                );

            return queueAttributesResponse.Attributes?.QueueArn;
        } catch (error) {
            console.error('Error getting queue ARN:', error);
            throw error;
        }
    }

    async findFunction(
        lambdaFunctionName: string,
    ): Promise<FunctionConfiguration | undefined> {
        let marker: string | undefined;
        try {
            while (true) {
                const listFunctionsCommand = new ListFunctionsCommand({
                    Marker: marker,
                });
                const listFunctionsResponse =
                    await this.lambda.send(listFunctionsCommand);
                const fn = listFunctionsResponse.Functions?.find((func) =>
                    func.FunctionName?.endsWith(lambdaFunctionName),
                );
                if (fn) return fn;

                marker = listFunctionsResponse.NextMarker;

                if (!marker) break;
            }
        } catch (error) {
            console.error('Error finding Lambda function:', error);
            throw error;
        }
    }

    async findEventSourceMapping(
        lambdaFunctionName: string,
        queueArn: string,
    ): Promise<EventSourceMappingConfiguration | undefined> {
        try {
            const listEventSourceMappingsCommand =
                new ListEventSourceMappingsCommand({
                    EventSourceArn: queueArn,
                    FunctionName: lambdaFunctionName,
                });
            const listEventSourceMappingsResponse = await this.lambda.send(
                listEventSourceMappingsCommand,
            );
            const mapping =
                listEventSourceMappingsResponse.EventSourceMappings?.[0];
            return mapping;
        } catch (error) {
            console.error('Error finding event source mapping:', error);
            throw error;
        }
    }

    async configureLambdaAsConsumer(
        queueArn: string,
        lambdaFunctionName: string,
        { maximumConcurrency, batchSize }: ConfigOptions,
    ): Promise<void> {
        try {
            const extractContextsFunction =
                await this.findFunction(lambdaFunctionName);
            if (!extractContextsFunction) {
                throw new Error(
                    `Lambda function "${lambdaFunctionName}" not found.`,
                );
            }

            const extractContextsFunctionArn =
                extractContextsFunction.FunctionArn;
            const eventSourceMapping = await this.findEventSourceMapping(
                extractContextsFunction.FunctionName!,
                queueArn,
            );

            if (eventSourceMapping) {
                if (
                    eventSourceMapping.ScalingConfig?.MaximumConcurrency !==
                        maximumConcurrency ||
                    eventSourceMapping.BatchSize !== batchSize
                ) {
                    // Event source mapping exists but configuration doesn't match
                    const response = await this.lambda.send(
                        new UpdateEventSourceMappingCommand({
                            UUID: eventSourceMapping.UUID!,
                            BatchSize: batchSize,
                            ScalingConfig: {
                                MaximumConcurrency: maximumConcurrency,
                            },
                        }),
                    );
                    console.log(
                        `Updated maximum concurrency for event source mapping of Lambda "${lambdaFunctionName}".`,
                    );
                } else {
                    // Configuration matches, no action needed
                    console.log(
                        `Maximum concurrency for event source mapping of Lambda "${lambdaFunctionName}" already configured.`,
                    );
                }
            } else {
                // Event source mapping doesn't exist, create a new one
                const response = await this.lambda.send(
                    new CreateEventSourceMappingCommand({
                        FunctionName: extractContextsFunctionArn!,
                        EventSourceArn: queueArn,
                        BatchSize: batchSize,
                        ScalingConfig: {
                            MaximumConcurrency: maximumConcurrency,
                        },
                    }),
                );
                console.log(
                    `Created event source mapping for Lambda "${lambdaFunctionName}" with maximum concurrency ${maximumConcurrency}.`,
                );
            }

            console.log(
                `Lambda "${lambdaFunctionName}" configured as the consumer of the queue.`,
            );
        } catch (error) {
            console.error('Error configuring Lambda as consumer:', error);
            throw error;
        }
    }

    async createQueueAndConfigureLambda(
        queueName: string,
        lambdaFunctionName: string,
        { maximumConcurrency, batchSize }: ConfigOptions,
    ): Promise<void> {
        try {
            let queueUrl = await this.getQueueUrl(queueName);
            if (!queueUrl) {
                queueUrl = await this.createQueue(queueName);
            }
            const queueArn = await this.getQueueArn(queueUrl);
            await this.configureLambdaAsConsumer(queueArn, lambdaFunctionName, {
                maximumConcurrency,
                batchSize,
            });
            console.log(
                `Queue "${queueName}" created and Lambda "${lambdaFunctionName}" configured as the consumer.`,
            );
        } catch (error) {
            console.error(
                'Error creating queue and configuring Lambda:',
                error,
            );
            throw error;
        }
    }

    async getNumberOfMessages(queueName: string): Promise<number> {
        try {
            const queueUrl = await this.getQueueUrl(queueName);
            const getQueueAttributesCommand = new GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ['ApproximateNumberOfMessages'],
            });

            const queueAttributesResponse = await this.sqs.send(
                getQueueAttributesCommand,
            );

            const numStr =
                queueAttributesResponse.Attributes?.ApproximateNumberOfMessages;
            if (!numStr)
                throw new Error(
                    'ApproximateNumberOfMessages string is undefined',
                );

            const isValid = Number.isInteger(Number.parseInt(numStr));
            if (!isValid)
                throw new Error(
                    'ApproximateNumberOfMessages is an invalid number',
                );

            const n = Number.parseInt(numStr);

            return n;
        } catch (error) {
            console.error(
                'Error getting number of messages from the queue:',
                error,
            );
            throw error;
        }
    }
}
