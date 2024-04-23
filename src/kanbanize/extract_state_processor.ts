import { SQS } from 'aws-sdk';
import axios, { AxiosError } from 'axios';
import _ from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { Config, ConfigFactory } from '../configuration/config';
import { IContextMappingNotifier } from '../notifications/context_mapping_notifier';
import { ISqsClient, QueueType } from '../notifications/sqs_client';
import { RawItem } from '../process_interfaces/revision_process_interface';
import { LogTags } from '../utils/log_tags';
import { IS3Client } from '../workitem/s3_client';
import {
    CONTEXT_WORKITEM_MAPPING_QUEUE,
    IExtractContextProcessor,
} from '../process_interfaces/extract_context_process_interface';

export interface IExtractProcessor {
    extractState(): Promise<void>;
}

type RawCustomField = {
    field_id: number;
    value: number;
    display_value?: string;
    values?: Array<{
        value_id: 0;
        position: 0;
    }>;
};
export type RawCard = {
    card_id: number;
    title: string;
    type_id: number | null;
    created_at: string;
    revision: number;
    last_modified: string;
    board_id: number;
    workflow_id: number;
    column_id: number;
    owner_user_id: number | null;
    transitions: Array<{
        board_id: number;
        workflow_id: number;
        section: number;
        column_id: number;
        lane_id: number;
        start: string;
        end: string;
    }>;
    custom_fields?: Array<RawCustomField>;
};

export type Transition = RawCard['transitions'][0] & {
    board_name: string;
    workflow_name: string;
    column_name: string;
};
export type CustomField = RawCustomField & {
    field_name: string;
};
// The type of transitions has to be overriden. Hence the Omit here
export type Card = Omit<RawCard, 'transitions' | 'custom_fields'> & {
    transitions: Transition[];
    board_name: string;
    column_name: string;
    type_name?: string;
    workflow_name: string;
    owner_user_name?: string;
} & {
    custom_fields: CustomField[];
};

type EntityNames = {
    workflows: Map<number, string>;
    boards: Map<number, string>;
    columns: Map<number, string>;
    types: Map<number, string>;
    customFields: Map<number, string>;
    users: Map<number, string>;
};

export type CardRawItem = Card & RawItem;

export type CardWorkflowIds = { card_id: number; workflow_id: number };

export class KanbanizeExtractProcessor
    implements IExtractProcessor, IExtractContextProcessor
{
    private configFactory: ConfigFactory;
    private _config?: Config;
    private itemUploader: IS3Client;
    private sqsClient: ISqsClient;
    private logger: Logger;
    private contextMappingNotifier: IContextMappingNotifier;
    private readonly PAGE_SIZE = 1000;
    private readonly PROMISES_CHUNK_SIZE = 1000;
    /**
     * Maximum number of pages to fetch. Each page has 1000 rows.
     * So fetch 100 * 1000 = 100,000 cards. This limit is sufficiently high
     *
     * The loop should break before it hits this limit
     */
    private readonly MAX_PAGES = 100;
    private entityNamesCache?: EntityNames;
    readonly SNS_BATCH_SIZE = 9000;

    fields = [
        'card_id',
        'title',
        'type_id',
        'created_at',
        'revision',
        'last_modified',
        'board_id',
        'workflow_id',
        'column_id',
        'owner_user_id',
        // Disabled for now. Not fetching these fields
        // 'discard_comment',
        // 'discarded_at',
        // 'is_blocked',
        // 'block_reason',
    ];

    constructor(opts: {
        configFactory: ConfigFactory;
        orgId: string;
        itemUploader: IS3Client;
        sqsClient: ISqsClient;
        logger: Logger;
        contextMappingNotifier: IContextMappingNotifier;
    }) {
        this.configFactory = opts.configFactory;
        this.itemUploader = opts.itemUploader;
        this.sqsClient = opts.sqsClient;
        this.logger = opts.logger;
        this.contextMappingNotifier = opts.contextMappingNotifier;
        this.logger = opts.logger.child({
            orgId: this.orgId,
        });
    }

    private get config(): Config {
        if (this._config === undefined) {
            throw new Error('config is undefined');
        }
        return this._config;
    }

    private get orgId(): string {
        return this.config.orgId;
    }

    private get datasourceId(): string {
        return this.config.datasource.datasourceId;
    }

    private buildQueryParams(page: number, extractContextWorkItemMaps = false) {
        const queryParams: Record<string, string> = {
            last_modified_from: encodeURIComponent(
                this.config.nextRunStartFrom().toISO()!,
            ),
            // Setting it to the maximum value
            per_page: this.PAGE_SIZE.toString(),
            page: page.toString(),
            // Uncomment the line below for develoment
            // 'card_ids': '132,133'
        };
        if (!extractContextWorkItemMaps) {
            queryParams['expand'] = 'transitions,custom_fields';
            queryParams['fields'] = this.fields.join(',');

            const workflowIds = _.chain(this.config.workflows)
                .map((w) => w.datasourceWorkflowId)
                .filter((id) => typeof id === 'string')
                .filter((id) => id.length > 0)
                .uniq()
                .value();

            if (workflowIds.length > 0) {
                queryParams['workflow_ids'] = workflowIds.join(',');
            }
        } else {
            queryParams['fields'] = 'card_id,workflow_id,type_id';

            // The workflow ids stored in contexts and the workflow table should be
            // exactly the same.
            // Getting the workflow ids here from contexts
            const workflowIds = _.chain(this.config.contexts)
                .map((c) => c.contextAddress)
                .map((cAddr) => cAddr.split(','))
                .flatten()
                .uniq()
                .value();

            if (workflowIds.length > 0) {
                queryParams['workflow_ids'] = workflowIds.join(',');
            }
        }

        return Object.entries(queryParams)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
    }

    private async getEntityNames(
        userIdsSet: Set<number>,
    ): Promise<EntityNames> {
        if (this.entityNamesCache) return this.entityNamesCache;

        const { url, accessToken } = this.config.serviceDetails;
        const boardsUrl = `${url}/boards?expand=structure`;
        const typesUrl = `${url}/cardTypes`;
        const customFieldsUrl = `${url}/customFields`;
        let usersUrl = `${url}/users`;
        if (userIdsSet.size > 0) {
            usersUrl = usersUrl.concat(`?user_ids=${Array.from(userIdsSet)}`);
        } else {
            this.logger.warn({
                message: 'getEntityNames called with an empty set of user ids',
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                datasourceType: this.config.datasourceType,
                tags: [LogTags.EXTRACT],
            });
        }
        const config = {
            headers: {
                apikey: accessToken,
            },
        };
        const emptyResponse = async () => {
            return {
                data: undefined,
            };
        };
        const [
            boardsResponse,
            typesResponse,
            customFieldsResponse,
            usersResponse,
        ] = await Promise.all([
            axios.get(boardsUrl, config),
            axios.get(typesUrl, config),
            axios.get(customFieldsUrl, config),
            userIdsSet.size === 0
                ? emptyResponse()
                : axios.get(usersUrl, config),
        ]);
        const boards = boardsResponse?.data?.data ?? [];
        const types = typesResponse?.data?.data ?? [];
        const customFields = customFieldsResponse?.data?.data ?? [];
        const users = usersResponse?.data?.data ?? [];

        const boardsMap = new Map<number, string>();
        const workflowsMap = new Map<number, string>();
        const columnsMap = new Map<number, string>();
        boards.forEach((b: any) => {
            boardsMap.set(b.board_id, b.name);
            // Object
            //     .entries(b.workflows ?? {})
            //     .forEach(([key, value]: any) => {
            //         workflowsMap.set(Number.parseInt(key), value.name);
            //     });

            const columns = b.structure?.columns ?? {};
            Object.entries(columns ?? {}).forEach(([key, value]: any) => {
                columnsMap.set(Number.parseInt(key), value.name);
            });

            const workflows = b.structure?.workflows ?? {};
            Object.entries(workflows ?? {}).forEach(([key, value]: any) => {
                workflowsMap.set(Number.parseInt(key), value.name);
            });
        });

        const typesMap = new Map<number, string>();
        types.forEach((t: any) => {
            typesMap.set(t.type_id, t.name);
        });

        const customFieldsMap = new Map<number, string>();
        if (Array.isArray(customFields)) {
            customFields.forEach((cf: any) => {
                customFieldsMap.set(cf.field_id, cf.name);
            });
        }

        const usersMap = new Map<number, string>();
        users.forEach(
            (u: { user_id: number; username: string; realname: string }) => {
                usersMap.set(u.user_id, u.realname);
            },
        );

        this.entityNamesCache = {
            boards: boardsMap,
            workflows: workflowsMap,
            columns: columnsMap,
            types: typesMap,
            customFields: customFieldsMap,
            users: usersMap,
        };
        return this.entityNamesCache;
    }

    private async getCards(page = 1): Promise<RawCard[]> {
        const { url: baseUrl, accessToken } = this.config.serviceDetails;
        const queryParams = this.buildQueryParams(page);
        const url = `${baseUrl}/cards?${queryParams}`;
        this.logger.info({
            message: `Fetching cards from page ${page}`,
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            queryParams,
            url,
            page,
            tags: [LogTags.EXTRACT],
        });

        try {
            const result = await axios.get(url, {
                headers: {
                    apikey: accessToken,
                },
            });
            const cards = result?.data?.data?.data ?? [];
            return cards;
        } catch (e) {
            // TODO: Better error logging
            console.log((e as AxiosError).response?.data);
            throw e;
        }
    }

    private async mapRawCardsToCards(cards: RawCard[]): Promise<Card[]> {
        // Dont fetch the entity names if there are no cards
        if (cards.length === 0) {
            return [];
        }

        const userIdsSet = new Set<number>(
            cards
                .filter((c) => Number.isInteger(c.owner_user_id))
                .map((c) => c.owner_user_id!),
        );
        const { boards, workflows, columns, types, customFields, users } =
            await this.getEntityNames(userIdsSet);

        return cards.map((c) => {
            const rawCustomFields = c.custom_fields ?? [];
            const transformedCustomFields: CustomField[] = [];
            rawCustomFields.forEach((rcf) => {
                const fieldName = customFields.get(rcf.field_id);
                if (!fieldName) {
                    this.logger.error({
                        message:
                            'Name of the custom field not found in the map',
                        field_id: rcf.field_id,
                        orgId: this.orgId,
                        datasourceId: this.datasourceId,
                        datasourceType: this.config.datasourceType,
                        tags: [LogTags.EXTRACT],
                    });
                } else {
                    transformedCustomFields.push({
                        ...rcf,
                        field_name: fieldName,
                    });
                }
            });
            const owner_user_name =
                c.owner_user_id !== null
                    ? users.get(c.owner_user_id)
                    : undefined;

            const card = {
                ...c,
                transitions: c.transitions.map((t) => ({
                    ...t,
                    workflow_name: workflows.get(t.workflow_id)!,
                    board_name: boards.get(t.board_id)!,
                    column_name: columns.get(t.column_id)!,
                })),
                board_name: boards.get(c.board_id)!,
                column_name: columns.get(c.column_id)!,
                // type_id can be null if the card has not be assigned a type
                type_name: c.type_id ? types.get(c.type_id)! : undefined,
                workflow_name: workflows.get(c.workflow_id)!,
                owner_user_name,
                custom_fields: transformedCustomFields,
            };
            return card;
        });
    }
    private mapCardsToRawItem(cards: Card[]): CardRawItem[] {
        return cards.map((c) => ({
            ...c,
            flomatikaFields: {
                datasourceId: this.datasourceId,
                datasourceType: this.config.datasource.datasourceType,
                excludeBeforeDate: DateTime.now().toISO(),
                extractTime: DateTime.now().toISO(),
                orgId: this.config.orgId,
                workItemId: c.card_id.toString(),
            },
        }));
    }

    private async sendSQSMessage(
        itemKey: string,
    ): Promise<SQS.SendMessageResult> {
        return this.sqsClient.sendMessageToQueueByDatasourceType(
            QueueType.PROCESS_REVISIONS,
            itemKey,
        );
    }

    async extractState() {
        this._config = await this.configFactory.create();

        this.logger = this.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.EXTRACT],
        });

        this.logger.info({
            message: 'Starting extract',
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.EXTRACT],
        });

        if (!this.config.isExtractDue()) {
            this.logger.info({
                message: 'Too soon to extract. Quitting',
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                tags: [LogTags.EXTRACT],
            });
            return;
        }

        const rawCards: RawCard[] = [];
        const batchSize =
            this.config.serviceDetails.batchSizeStateItems ?? this.PAGE_SIZE;
        const pages = Math.ceil(batchSize / this.PAGE_SIZE);
        for (let i = 1; i <= pages; i++) {
            this.logger.info({
                message: 'Fetching page',
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                page: i,
                tags: [LogTags.EXTRACT],
            });
            const cards = await this.getCards(i);
            this.logger.info({
                message: `Fetched ${cards.length} cards from page ${i}`,
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                page: i,
                tags: [LogTags.EXTRACT],
            });
            if (cards.length === 0) break;
            cards.forEach((c) => rawCards.push(c));
        }

        this.logger.info({
            message: `Fetched ${rawCards.length} `,
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.EXTRACT],
        });

        const cards = await this.mapRawCardsToCards(rawCards);
        const items = this.mapCardsToRawItem(cards);

        const chunks = _.chunk(items, this.PROMISES_CHUNK_SIZE);
        for (const chunk of chunks) {
            Promise.all(
                chunk.map((item) => {
                    const fn = async () => {
                        try {
                            const itemKey =
                                await this.itemUploader.uploadItem(item);
                            this.logger.info({
                                message: 'Uploaded work item to S3',
                                orgId: this.orgId,
                                workItemId: item.flomatikaFields.workItemId,
                                itemKey,
                                tags: [LogTags.EXTRACT],
                            });
                            if (itemKey) {
                                const sqsResult =
                                    await this.sendSQSMessage(itemKey);
                                this.logger.info({
                                    message: 'Queued items to SQS',
                                    orgId: this.orgId,
                                    workItemId: item.flomatikaFields.workItemId,
                                    itemKey,
                                    sqsResult,
                                    tags: [LogTags.EXTRACT],
                                });
                            }
                        } catch (error) {
                            this.logger.error({
                                message: 'Error in extract state loop',
                                errorMessage: (error as Error).message,
                                errorStack: (error as Error).stack,
                                orgId: this.orgId,
                                workItemId: item.flomatikaFields.workItemId,
                                datasourceId: this.datasourceId,
                                datasourceType:
                                    this.config.datasource.datasourceType,
                                tags: [LogTags.EXTRACT],
                            });
                        }
                    };
                    return fn();
                }),
            );
            const lastModified = _.last(items)?.last_modified;
            const lastChangedDate =
                lastModified && DateTime.fromISO(lastModified).isValid
                    ? DateTime.fromISO(lastModified)
                    : DateTime.fromMillis(0);
            await this.config.updateStateLastRun(
                DateTime.now(),
                lastChangedDate,
            );
        }
    }

    private async getCardIds(page = 1): Promise<CardWorkflowIds[]> {
        const { url, accessToken } = this.config.serviceDetails;
        const queryParams = this.buildQueryParams(page, true);
        const cardsEndpoint = `${url}/cards?${queryParams}`;

        try {
            const result = await axios.get(cardsEndpoint, {
                headers: {
                    apikey: accessToken,
                },
            });
            const cards = result?.data?.data?.data ?? [];
            return cards;
        } catch (e) {
            // TODO: Better error logging
            console.log((e as AxiosError).response?.data);
            throw e;
        }
    }
    async extractContextWorkItemMaps(contextId: string) {
        this._config = await this.configFactory.create();

        this.logger.info({
            message: 'Starting extract of context-workitem maps',
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
        });

        if (!this.config.isExtractDue()) {
            this.logger.info({
                message: 'Too soon to extract. Quitting',
                orgId: this.orgId,
                datasourceId: this.datasourceId,
                tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
            });
            return;
        }

        const allItems: CardWorkflowIds[] = [];
        const batchSize =
            this.config.serviceDetails.batchSizeStateItems ?? this.PAGE_SIZE;
        const pages = Math.ceil(batchSize / this.PAGE_SIZE);
        for (let i = 1; i <= this.MAX_PAGES; i++) {
            const cards = await this.getCardIds(i);
            if (cards.length === 0) break;

            cards.forEach((c) => allItems.push(c));
        }

        this.logger.info({
            message: 'Starting extract of context-workitem maps',
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
        });

        const extractRunAt = DateTime.utc();

        const workflowIdContextMap = new Map<number, string[]>();
        this.config.contexts
            .filter((c) => c.id === contextId)
            .forEach((c) => {
                const workflowIds = (c.contextAddress ?? '')
                    .split(',')
                    .map((id) => Number.parseInt(id));
                workflowIds.forEach((wId) => {
                    if (!workflowIdContextMap.has(wId)) {
                        workflowIdContextMap.set(wId, []);
                    }
                    workflowIdContextMap.get(wId)!.push(c.id);
                });
            });

        const groups = _.chain(allItems)
            .map((item) => {
                const contextIds = workflowIdContextMap.get(item.workflow_id);
                if (!contextIds || contextIds.length === 0) {
                    this.logger.error({
                        message: 'contextId not found for workflowId',
                        workflowId: item.workflow_id,
                        cardId: item.card_id,
                        tags: [LogTags.CONTEXT_WORKITEM_MAPPING],
                    });
                    return [];
                }

                return contextIds.map((contextId) => ({
                    contextId,
                    cardId: item.card_id,
                }));
            })
            .flatten()
            .filter((m) => m.contextId !== undefined) // Probably not required. Added it here as a fallback
            .groupBy((m) => m.contextId)
            .value();

        for (const key of Object.keys(groups)) {
            const contextId = key;
            const workItemIds = (groups[key] ?? []).map((elem) =>
                elem.cardId.toString(),
            );

            // TODO: Test this change
            // Could not test this because at the time of this code change,
            // there was an error when running locally. Most likely due to invalid configuration
            // in the wizard
            // The error was thrown from the code above - "contextId not found for workflowId"
            // Queue sprint to the queue for sprint-work item mapping
            const s3UploadResult = await this.itemUploader.uploadWorkItemArray(
                workItemIds,
                contextId,
                this.orgId,
                this.datasourceId,
            );
            const result = await this.sqsClient.sendMessageToQueue(
                CONTEXT_WORKITEM_MAPPING_QUEUE,
                {
                    orgId: this.orgId,
                    datasourceId: this.datasourceId,
                    contextId,
                    workItemIdKey: s3UploadResult,
                    extractRunAt: extractRunAt.toISO(),
                },
            );
        }
    }
}
