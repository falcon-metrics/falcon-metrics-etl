/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _ from 'lodash';
import { Logger } from 'pino';
import slugify from 'slugify';
import { ContextItem, IContext } from '../data/context_aurora';
import { IDatasource } from '../data/datasource_aurora';
import { ISqsClient } from '../notifications/sqs_client';
import { QueueManager } from '../scheduler/queue_manager';
import { isDev } from '../utils/dev';
import { LogTags } from '../utils/log_tags';
import config from '../scheduler/config';

export const CONTEXTS_EXTRACT_QUEUE = 'ExtractContextsQueue';
const EXTRACT_CONTEXTS_LAMBDA = 'extractContexts';

export class ContextsQueuer {
    private logger: Logger;
    private context: IContext;
    private sqsClient: ISqsClient;
    private datasource: IDatasource;
    private queueManager = new QueueManager();

    constructor(opts: {
        logger: Logger;
        context: IContext;
        sqsClient: ISqsClient;
        datasource: IDatasource;
    }) {
        this.logger = opts.logger;
        this.datasource = opts.datasource;
        this.context = opts.context;
        this.sqsClient = opts.sqsClient;
        this.logger = opts.logger.child({
            tags: [LogTags.EXTRACT_CONTEXTS],
        });
    }

    async getDatasources() {
        const datasources = (await this.datasource.getAll()).filter(
            (datasource) => {
                if (isDev) return datasource.runType;
                // If not development, keep only the enabled datasources
                return datasource.enabled && datasource.runType;
            },
        );

        return datasources;
    }

    async getContexts(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<ContextItem>> {
        const contexts = (
            await this.context.getContextsForOrgDataSource(orgId, datasourceId)
        ).filter(
            // toString is a fall back. This is already a string
            // Sometimes the context address is a string with spaces. Not sure why. Hence this filter
            (context) =>
                (context.contextAddress ?? '').toString().replace(' ', '')
                    .length > 0,
        );
        return contexts;
    }

    private buildQueueName(orgId: string, datasourceId: string) {
        const alphanumericRegex = /[a-zA-Z0-9_]/g;
        const fullStr = `${CONTEXTS_EXTRACT_QUEUE}_${orgId}_${datasourceId}`;
        const alphaNumericStr = fullStr.match(alphanumericRegex)!.join('');
        const truncatedString = _.truncate(slugify(alphaNumericStr, '_'), {
            // AWS queue name limit is 80. Setting it to less than the limit
            length: 75,
            omission: '',
            separator: '',
        });
        return truncatedString;
    }

    async getAllContexts() {
        const datasources = await this.getDatasources();
        const chunks = _.chunk(datasources, 5);
        const allContexts: ContextItem[] = [];
        for (const chunk of chunks) {
            const contexts = await Promise.all(
                chunk.map((d) => this.getContexts(d.orgId, d.datasourceId)),
            );
            allContexts.push(..._.flatten(contexts));
        }
        return _.chain(allContexts)
            .sortBy(allContexts, (c) => c.orgId)
            .map((c) => {
                const d = datasources.find(
                    (d) => d.datasourceId === c.datasourceId,
                );
                if (!d) {
                    throw new Error(
                        `Count not find datasource for context ${c.id}, datasourceId ${c.datasourceId}`,
                    );
                }

                return {
                    context: c,
                    datasource: d,
                    queueName: this.buildQueueName(c.orgId, c.datasourceId),
                };
            })
            .value();
    }

    async createQueues(queueNames: string[]) {
        const chunks = _.chunk(queueNames, 5);
        for (const chunk of chunks) {
            await Promise.all(
                chunk.map((queueName) => {
                    return this.queueManager.createQueueAndConfigureLambda(
                        queueName,
                        EXTRACT_CONTEXTS_LAMBDA,
                        {
                            batchSize: config.batchSize ?? 1,
                            maximumConcurrency: config.maximumConcurrency ?? 1,
                        },
                    );
                }),
            );
        }
        this.logger.info({
            message: 'Created queues for context extraction',
            count: queueNames.length,
        });
    }

    async queueContextsForExtract() {
        const contexts = await this.getAllContexts();

        const queueNames = _.chain(contexts)
            .map(({ queueName }) => queueName)
            .uniq()
            .value();

        this.logger.info({
            message: 'Creating queues for context extraction',
            count: queueNames.length,
            queueNames,
        });

        await this.createQueues(queueNames);

        this.logger.info({
            message: 'Queuing contexts for extract',
            contexts,
            count: contexts.length,
        });

        const numMessages = new Map<string, number>();

        // Push in chunks
        const chunks = _.chunk(contexts, 5);
        const errors = [];
        for (const chunk of chunks) {
            try {
                const promises = chunk.map(async (c) => {
                    const logger = this.logger.child({
                        queuName: c.queueName,
                        ...c.context,
                        ...c.datasource,
                    });
                    if (!numMessages.has(c.queueName)) {
                        const n = await this.queueManager.getNumberOfMessages(
                            c.queueName,
                        );
                        logger.info({
                            message: 'Fetched number of messages in the queue',
                            numberOfMessages: n,
                        });
                        numMessages.set(c.queueName, n);
                    }

                    const n = numMessages.get(c.queueName);
                    if (n === 0) {
                        await this.sqsClient.sendMessageToQueue(c.queueName, c);
                    } else {
                        logger.info({
                            message:
                                'Queue still has messages. Not sending messages to the queue',
                        });
                    }
                });
                await Promise.all(promises);
            } catch (e) {
                errors.push({ error: e, chunk });
                this.logger.error({
                    message: 'Error when queuing context for extract',
                    count: contexts.length,
                    errorMessage: e.message,
                    errorStack: e.stack,
                    chunk,
                });
            }
        }
        if (errors.length > 0) {
            this.logger.info({
                message: 'Errors when queueing contexts for extract',
                errors,
            });
        } else {
            this.logger.info({
                message: 'Finished queuing contexts for extract',
                count: contexts.length,
            });
        }
    }
}
