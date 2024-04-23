import _, { flatten, zip } from "lodash";
import { Logger } from 'pino';
import { DateTime } from "luxon";
import fetch from 'node-fetch';
import { ContextItem, IContext } from "../../data/context_aurora";
import { IDatasource, ServiceDetails } from "../../data/datasource_aurora";
import { ISqsClient } from "../../notifications/sqs_client";
import { JiraBoard, JiraSprint } from "../../process_interfaces/extract_jira_sprints_process_interface";
import { FlomatikaSprint, ISprintProcessor, SPRINT_WORKITEM_MAPPING_QUEUE } from "../../process_interfaces/extract_sprints_process_interface";
import { SprintLoadProcessor } from "../../workitem/sprint/sprint_load_processor_aurora";
import { QueueItem } from "../../workitem/sprint/sprint_mapping_handler";
import { setupHeaders } from "../data/utils";
import { LogTags } from "../../utils/log_tags";


/**
 * Jira board of type scrum. 
 * 
 * A sprint board with `type:scrum` contains sprints.
 * 
 * A sprint board with `type:kamban` does not contain sprints. 
 * If you make a request to get sprints from a kanban board, it a 400 error.
 */
const SCRUM_BOARD = 'scrum';
export class JiraSprintsProcessor implements ISprintProcessor {
    private orgId: string;
    private datasourceId: string;
    private datasourceType: string;
    private context: IContext;
    private datasource: IDatasource;
    private sprintLoader: SprintLoadProcessor;
    private logger: Logger;
    private runParameters: ServiceDetails | undefined;
    private sqsClient: ISqsClient;

    constructor(opts: {
        context: IContext;
        datasource: IDatasource;
        datasourceType: string;
        sprintLoader: SprintLoadProcessor;
        orgId: string;
        datasourceId: string;
        sqsClient: ISqsClient;
        logger: Logger;
    }) {
        this.orgId = opts.orgId;
        this.context = opts.context;
        this.datasource = opts.datasource;
        this.datasourceType = opts.datasourceType;
        this.sprintLoader = opts.sprintLoader;
        this.datasourceId = opts.datasourceId;
        this.logger = opts.logger;
        this.runParameters = undefined;
        this.sqsClient = opts.sqsClient;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
        });
    }

    async getContexts(datasourceId: string): Promise<ContextItem[]> {
        const contexts = this.context.getContextsForOrgDataSource(this.orgId, datasourceId);
        return contexts;
    }

    async makeRequest(url: string): Promise<Record<string, any>> {
        try {
            const runParameters = await this.getRunParameters();
            const { accessToken } = runParameters;
            if (accessToken === undefined) {
                throw new Error('Access token is undefined');
            }
            const headers = setupHeaders(accessToken);
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`Request to ${url} failed with status ${response.status}`);
            const data = await response.json();
            return data;
        } catch (e: unknown) {
            throw e;
        }
    }

    /**
     * Jira boards of type "kanban" do not contain sprints
     * The query to fetch sprints from a kanban board fails with a 400 error
     * 
     * This method makes the GET API request to fetch board infromation from Jira for each board,
     * checks if the type of the board is "scrum"
     * @param board A JiraBoard
     */
    async isScrumBoard(board: JiraBoard): Promise<boolean> {
        const runParameters = await this.getRunParameters();
        const { url: urlStr } = runParameters;
        if (urlStr === undefined) {
            throw new Error('URL is undefined');
        }
        let isScrumBoard = false;
        try {
            const data = await this.makeRequest(board.url.toString());
            if (!data?.type) throw new Error("The property 'type' does not exist in the response");
            const { type } = data;
            isScrumBoard = (type === SCRUM_BOARD);
        } catch (e) {
            this.logger.error(({
                message: 'Request to get board details failed in isScrumBoard',
                url: board.url.toString(),
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
        }
        return isScrumBoard;
    }

    /**
     * Get all boards in the given context
     * @param contextId 
     * @returns List of Jira Boards
     */
    async getBoards(contextId: string): Promise<JiraBoard[]> {
        const boards: JiraBoard[] = [];

        const runParameters = await this.getRunParameters();
        const { url: urlStr } = runParameters;
        if (urlStr === undefined) {
            this.logger.error(({
                message: `URL is undefined for contextId: ${contextId} org ID: ${this.orgId} data source ID: ${this.datasourceId}`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                contextId
            }));
            // Dont throw error. Log the error message and return an empty list. 
            return boards;
        }

        // Build the URL here - Because the base URL is not the URL required here.
        const url = new URL(urlStr);
        const requestUrl = `${url.protocol}//${url.hostname}/rest/agile/1.0/board/filter/${contextId}`;


        try {
            const data = await this.makeRequest(requestUrl);
            const values: any[] = data.values;
            values
                .map((v): JiraBoard => ({
                    id: v.id,
                    name: v.name,
                    url: new URL(v.self),
                }))
                .forEach((v) => boards.push(v));
        } catch (e: unknown) {
            this.logger.error(({
                message: `Request to Jira to get boards failed`,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                url: urlStr,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                contextId
            }));
        }

        return boards;

    }

    /**
     * Fetch the sprints in the given board ID
     * @param boardId ID of the board
     * @returns List of sprints
     */
    async getSprints(boardId: number): Promise<JiraSprint[]> {
        const sprints: JiraSprint[] = [];

        const runParameters = await this.getRunParameters();
        const { url: urlStr } = runParameters;
        if (urlStr === undefined) {
            this.logger.error(({
                message: `URL is undefined. org ID: ${this.orgId} data source ID: ${this.datasourceId}`,
                boardId,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
            }));
        } else {
            // Build the URL here - Because the base URL is not the URL required here.
            const url = new URL(urlStr);
            const requestUrl = `${url.protocol}//${url.hostname}/rest/agile/1.0/board/${boardId}/sprint`;

            try {
                const data = await this.makeRequest(requestUrl);
                const values: any[] = data.values;
                const processDate = (dateStr: string | undefined, sprintId: string): DateTime | undefined => {
                    if (dateStr === undefined) return undefined;
                    const dateTime = DateTime.fromISO(dateStr);
                    if (dateTime.isValid) return dateTime;
                    else {
                        this.logger.error(({
                            message: `Invalid date in the sprint. org ID: ${this.orgId} data source ID: ${this.datasourceId} contextId: ${boardId} sprintId: ${sprintId}`,
                            boardId,
                            sprintId,
                            url: requestUrl,
                            response: data,
                            datasourceType: this.datasourceType,
                            datasourceId: this.datasourceId,
                            orgId: this.orgId,
                        }));
                        return undefined;
                    }
                };
                values
                    .map((value): JiraSprint => {
                        const startDate = processDate(value.startDate, value.id);
                        const endDate = processDate(value.startDate, value.id);
                        const completeDate = processDate(value.completeDate, value.id);

                        return {
                            id: value.id,
                            name: value.name,
                            state: value.state,
                            startDate,
                            endDate,
                            completeDate,
                            goal: value.goal
                        };
                    })
                    .forEach((v) => sprints.push(v));


            } catch (e: unknown) {
                this.logger.error(({
                    message: `Request to Jira to get the sprint from board with id ${boardId} failed`,
                    boardId,
                    url: requestUrl,
                    datasourceType: this.datasourceType,
                    datasourceId: this.datasourceId,
                    errorMessage: (e as Error).message,
                    errorStack: (e as Error).stack,
                    orgId: this.orgId,
                }));
            }
        }


        return sprints;
    }

    /**
     * Transforms a JiraSprint to FlomatikaSprint
     * 
     * A JiraSprint does contain datasoruce, context, and board information.
     * So those as passed as parameters
     * 
     * @param param0 
     * @returns 
     */
    transformSprint({ datasourceId, contextId, boardId, jiraSprint }:
        {
            datasourceId: string,
            contextId: string,
            boardId: number,
            jiraSprint: JiraSprint;
        }): FlomatikaSprint {
        return {
            orgId: this.orgId,
            datasourceId: datasourceId,
            sprintId: jiraSprint.id.toString(),
            name: jiraSprint.name,
            startDate: jiraSprint.startDate,
            // TODO: which date to use here? completedDate or endDate
            endDate: jiraSprint.endDate,
            flomatikaCreatedDate: DateTime.now(),
        };
    }


    /**
     * Get boards in the given contexts. 
     * 
     * For every context in contexts:
     * - filter = context.contextAddress
     * - Fetch fetch all the Jira boards in that with that filter
     * - Filter out the boards whose type is not "scrum"
     * - Add the list of boards to the map with the key as a context ID
     * 
     * Return the map
     * 
     *
     * @param contexts 
     * @returns A map. Maps context ID to list of boards in that context
     */
    async getBoardsInContexts(contexts: ContextItem[]): Promise<Map<string, JiraBoard[]>> {
        const contextBoardsMap = new Map<string, JiraBoard[]>();

        // Build an array of promises
        const getBoardsPromises = contexts
            .filter(({ contextAddress }) => contextAddress !== undefined && contextAddress !== null)
            .map(async ({ id: contextId, contextAddress, name }) => {
                const scrumBoards: JiraBoard[] = [];
                try {
                    // Filtered out undefined and null above, but compiler does not "understand" it. Hence the override
                    const allBoards: JiraBoard[] = await this.getBoards(contextAddress!);

                    // Call the GET board API and check if the board is a scrum board (board.type = 'scrum')
                    const scrumBoardsBoolArray = await Promise.all(allBoards.map((board) => this.isScrumBoard(board)));

                    // Keep only the scrum boards, filter out other types of boards
                    zip(allBoards, scrumBoardsBoolArray)
                        .forEach(([board, isScrumBoard]) => {
                            if (board && isScrumBoard) scrumBoards.push(board);
                            else {
                                this.logger.info(({
                                    message: 'This board is not a scrum board. Ignoring this board',
                                    boardId: board?.id,
                                    contextId: contextId,
                                    datasourceType: this.datasourceType,
                                    datasourceId: this.datasourceId,
                                    orgId: this.orgId,
                                }));
                            }
                        });
                } catch (e) {
                    // Dont throw error here. One promise fails, other promises dont get executed
                    this.logger.error(({
                        message: `Error fetching boards in context for org ID: ${this.orgId}, data source ID: ${this.datasourceId} context ID: ${contextId}`,
                        contextId: contextId,
                        datasourceType: this.datasourceType,
                        datasourceId: this.datasourceId,
                        errorMessage: (e as Error).message,
                        errorStack: (e as Error).stack,
                        orgId: this.orgId,
                    }));
                }

                return scrumBoards;
            });

        const boardsInContexts = await Promise.all(getBoardsPromises);

        // Add boards to the map. Map context id to boards
        zip(contexts, boardsInContexts)
            .forEach(([context, boards]) => {
                if (context && boards)
                    contextBoardsMap.set(context.id, boards);
                else
                    throw new Error('id or board is null');

            });


        return contextBoardsMap;
    }

    /**
     * Boards contain sprints Get sprints for the given list of boards
     * @param boards 
     * @returns 
     */
    async getSprintsInBoards(boards: JiraBoard[]): Promise<Map<number, JiraSprint[]>> {
        const boardSprintsMap = new Map<number, JiraSprint[]>();

        // Build an array of promises
        const getSprintsPromises = boards.map(async (board) => {
            const sprints = await this.getSprints(board.id);
            return sprints;
        });
        // Get sprints from all boards
        const sprintsForBoards = await Promise.all(getSprintsPromises);

        // Add sprints to the map. Map board ID to sprints in that board
        zip(boards, sprintsForBoards)
            .forEach(([board, sprints]) => {
                if (board && sprints)
                    boardSprintsMap.set(board?.id, sprints);
                else {
                    this.logger.error(({
                        message: `Board or sprints is null`,
                        board: board,
                        sprints: sprints,
                        datasourceType: this.datasourceType,
                        datasourceId: this.datasourceId,
                        orgId: this.orgId,
                    }));
                }

            });

        return boardSprintsMap;
    }

    /**
     * Do ETL 
     * - Extract Sprints
     * - Transform JiraSprints to FlomatikaSprints
     * - Load FlomatikaSprints to the database
     * 
     * And queue sprints for sprint-work item mapping
     */
    async process(): Promise<void> {
        // Extract
        const { contextBoardsMap, boardSprintsMap } = await this.extract();
        this.logger.info(({
            message: `Extracted sprints from Jira`,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
        }));

        // Transform
        const flomatikaSprints = this.transform(contextBoardsMap, boardSprintsMap);
        this.logger.info(({
            message: `Transformed ${flomatikaSprints.length} Jira sprints to Flomatika sprints`,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
        }));

        //Load
        await this.load(flomatikaSprints);
        this.logger.info(({
            message: `Loaded ${flomatikaSprints.length} Flomatika sprints`,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
        }));
        // Queue item for Sprint-Work Item mapping 
        try {
            const promises = _.chain(flomatikaSprints)
                .uniqBy((fs) => [fs.orgId, fs.datasourceId, fs.sprintId].join('#'))
                .map(sprint => this.sqsClient.sendMessageToQueue(
                    SPRINT_WORKITEM_MAPPING_QUEUE,
                    {
                        sprint,
                        metadata: {
                            datasourceType: this.datasourceType
                        }
                    } as QueueItem))
                .value();
            await Promise.all(promises);

        } catch (e) {
            this.logger.error(({
                message: `Failed to queue sprints`,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                orgId: this.orgId,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
            }));
            throw e;
        }
    }

    /**
     * Extract sprints from Jira. 
     * - Map context ID to boards in the context
     * - Map board ID to sprints in the board
     * 
     * Returns 2 maps. 
     * 
     * Why 2 maps? 
     *  - This is to avoid including the context Id in the boards and 
     * context ID and board ID in the sprints. This keeps the shape of the sprints same
     * as what you get from Jira. You dont have to include board ID and context ID in the sprint object. 
     * You can keep that information at the Map level instead
     * @returns 
     */
    async extract(): Promise<{
        contextBoardsMap: Map<string, JiraBoard[]>,
        boardSprintsMap: Map<number, JiraSprint[]>;
    }> {
        // Get all contexts that are NOT archived (deleted) and filter the items with context addresss set
        const contexts = (await this.getContexts(this.datasourceId))
            .filter(({ contextAddress }) => contextAddress);

        // Get boards in all the contexts
        const contextBoardsMap = await this.getBoardsInContexts(contexts);

        // Flatten the map to a list containing all the boards from all the contexts
        const allBoards = flatten(
            Array.from(contextBoardsMap).map(([contextId, boards]) => boards)
        );

        // Get sprints in boards
        const boardSprintsMap = await this.getSprintsInBoards(allBoards);

        return {
            contextBoardsMap,
            boardSprintsMap
        };
    }

    /**
     * Transform the 2 maps to a flat list of FlomatikaSprints
     */
    transform(
        contextBoardsMap: Map<string, JiraBoard[]>,
        boardSprintsMap: Map<number, JiraSprint[]>
    ): FlomatikaSprint[] {
        // Doing the transformation as a separate step for better readability
        const flomatikaSprints: FlomatikaSprint[] = [];

        // Transform JiraSprints to FlomatikaSprints. 
        for (const [contextId, boards] of contextBoardsMap.entries()) {
            boards.forEach(board => {
                const { id: boardId } = board;

                // If boardId is not found in the map, throw error
                if (boardSprintsMap.has(boardId) === false) {
                    throw new Error(`boardId ${boardId} not found in boardSprintMap`);
                }

                // Get Jira sprints in the board
                const jiraSprints = boardSprintsMap.get(boardId);

                // Transform Jira sprints to Flomatika sprints
                // TODO: Fix. Typescript does not infer from the has() check above. Hence the ! override below
                jiraSprints!
                    .map(jiraSprint => this.transformSprint({
                        contextId,
                        boardId,
                        datasourceId: this.datasourceId,
                        jiraSprint
                    }))
                    .forEach((flomatiakSprint) => flomatikaSprints.push(flomatiakSprint));
            });
        }
        return flomatikaSprints;
    }

    /**
     * Load step of ETL. Write the the list of FlomatikaSprints to the database
     * @param sprints 
     */
    async load(sprints: FlomatikaSprint[]): Promise<void> {
        for (const sprint of sprints) {
            await this.sprintLoader.processSprint(sprint);
        }
    }

    async getRunParameters(): Promise<ServiceDetails> {
        if (this.runParameters === undefined) {
            this.runParameters = await this.datasource.getServiceDetails(
                this.orgId,
                this.datasourceId,
            );
            if (!this.runParameters) {
                throw new Error('Datasource parameters not found');
            }
        }

        return this.runParameters;
    }


    /**
     * Fetch the sprints in the given board ID
     * @param boardId ID of the board
     * @returns List of sprints
     */
    async getIssuesInSprint(sprint: FlomatikaSprint): Promise<string[]> {
        const { sprintId } = sprint;
        const issues: string[] = [];

        const runParameters = await this.getRunParameters();
        const { url: urlStr } = runParameters;
        if (urlStr === undefined) {
            this.logger.error({
                message: `URL is undefined`,
                sprint
            });
        } else {
            // Build the URL here - Because the base URL is not the URL required here.
            const url = new URL(urlStr);
            const requestUrl = `${url.protocol}//${url.hostname}/rest/agile/1.0/sprint/${sprintId}/issue?fields=key`;

            try {
                const data = await this.makeRequest(requestUrl);
                data.issues?.forEach((issue: any) => issues.push(issue.key));
            } catch (e: unknown) {
                this.logger.error(({
                    message: 'Request to Jira to get issues in sprint failed',
                    sprintId: sprintId,
                    url: requestUrl,
                    datasourceType: this.datasourceType,
                    datasourceId: this.datasourceId,
                    orgId: this.orgId,
                    errorMessage: (e as Error).message,
                    errorStack: (e as Error).stack,
                }));
            }
        }

        return issues;
    }

    async loadSprintWorkItemMap(flomatiakSprint: FlomatikaSprint, workItemIds: string[]): Promise<void> {
        for (const workItemId of workItemIds) {
            await this.sprintLoader.processSprintWorkItemMap({
                orgId: flomatiakSprint.orgId,
                datasourceId: flomatiakSprint.datasourceId,
                sprintId: flomatiakSprint.sprintId,
                workItemId
            });
        }
    }

    async mapSprintsToWorkItems(flomatikaSprint: FlomatikaSprint): Promise<void> {
        try {
            const itemsInSprint: string[] = await this.getIssuesInSprint(flomatikaSprint);
            this.logger.info(({
                message: `Fetched ${itemsInSprint.length} work items from sprint ${flomatikaSprint.sprintId}`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
            }));
            await this.loadSprintWorkItemMap(flomatikaSprint, itemsInSprint);
            this.logger.info(({
                message: `Mapped sprint ${flomatikaSprint.sprintId} to ${itemsInSprint.length} work items`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                sprintId: flomatikaSprint.sprintId,
            }));
        } catch (e) {
            this.logger.error(({
                message: `Error in Sprints mapping`,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                orgId: this.orgId,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
            }));
            throw e;
        }
    }
}
