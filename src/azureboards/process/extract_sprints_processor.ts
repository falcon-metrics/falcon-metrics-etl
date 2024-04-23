import btoa from 'btoa';
import _ from 'lodash';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';
import { ContextItem, IContext } from "../../data/context_aurora";
import { IDatasource, PrivateFields, ServiceDetails } from "../../data/datasource_aurora";
import { IProject, ProjectItem } from "../../data/project_aurora";
import { ISqsClient } from "../../notifications/sqs_client";
import { FlomatikaSprint, ISprintProcessor, SprintMetadataBase, SPRINT_WORKITEM_MAPPING_QUEUE } from "../../process_interfaces/extract_sprints_process_interface";
import { SprintLoadProcessor } from "../../workitem/sprint/sprint_load_processor_aurora";


type AzureTeam = {
    id: string;
    url: string;
    name: string;
    identityUrl: string;
    description: string;
    projectName: string;
    projectId: string;
};

type SprintMetadata = SprintMetadataBase & {
    orgName: string,
    projectId: string,
    teamId: string,
};

type Iteration = {
    id: string;
    name: string;
    attributes: {
        startDate?: string,
        finishDate?: string,
        timeFrame?: string,
    };
    identityUrl: string;
    url: string;
    metadata: SprintMetadata;
};

export class AzureBoardsSprintsProcessor implements ISprintProcessor {
    private orgId: string;
    private datasourceId: string;
    private datasourceType: string;
    private context: IContext;
    private datasource: IDatasource;
    private sprintLoader: SprintLoadProcessor;
    private logger: Logger;
    private runParameters: ServiceDetails | undefined;
    private sqsClient: ISqsClient;
    project: IProject;
    baseUrl: string | undefined;


    constructor(opts: {
        context: IContext;
        datasource: IDatasource;
        sprintLoader: SprintLoadProcessor;
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        sqsClient: ISqsClient;
        logger: Logger;
        project: IProject;
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
        this.project = opts.project;
    }

    async getProjectConfigs(): Promise<ProjectItem[]> {
        const projects = await this.project.getAllProjects(
            this.orgId,
            this.datasourceId,
        );
        return projects;
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

    setupHeaders(accessToken: string) {
        return {
            'Content-Type': 'application/json',
            // The user name for the azure API can be anything. 
            // It only checks the password
            Authorization: 'Basic '.concat(btoa('name:'.concat(accessToken))),
        };
    }

    private getOrgNameFromUrl(serviceUrl: string) {
        return new URL(serviceUrl).pathname.replace('/', '');
    }

    /**
     * Method to setup the headers and make the request. 
     * Throws an error if the request fails
     */
    private async makeRequest(url: string): Promise<Record<string, any>> {
        try {
            const runParameters = await this.getRunParameters();
            const { accessToken } = runParameters;
            if (accessToken === undefined) {
                throw new Error('Access token is undefined');
            }
            const headers = this.setupHeaders(accessToken);
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`Request to ${url} failed with status ${response.status}`);
            const data = await response.json();
            return data;
        } catch (e: unknown) {
            throw e;
        }
    }

    /**
     * Get teams for a project
     * 
     * https://docs.microsoft.com/en-us/rest/api/azure/devops/core/teams/get-teams?view=azure-devops-rest-6.0&tabs=HTTP
     */
    private async getTeams(projectId: string): Promise<AzureTeam[]> {
        const teams: AzureTeam[] = [];
        const { url: serviceUrl } = await this.getRunParameters();
        if (!serviceUrl) throw new Error('URL is undefined');
        const orgName = this.getOrgNameFromUrl(serviceUrl);
        const fullUrl = new URL(`${orgName}/_apis/projects/${projectId}/teams?api-version=6.0`, serviceUrl.replace('analytics.', '')).href;
        this.logger.info(({
            message: 'Fetching teams from azure',
            url: fullUrl,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
            projectId,
        }));
        const data = await this.makeRequest(fullUrl);
        (data.value as AzureTeam[]).forEach(team => teams.push(team));

        return teams;
    }

    /**
     * Get iterations for a team
     * 
     * https://docs.microsoft.com/en-us/rest/api/azure/devop>s/work/iterations/list?view=azure-devops-rest-6.0&tabs=HTTP 
     */
    private async getIterations(team: AzureTeam): Promise<Iteration[]> {
        const iterations: Iteration[] = [];
        const { url: serviceUrl } = await this.getRunParameters();
        if (!serviceUrl) throw new Error('URL is undefined');
        const orgName = this.getOrgNameFromUrl(serviceUrl);
        const fullUrl = new URL(`${orgName}/${team.projectId}/${team.id}/_apis/work/teamsettings/iterations?api-version=6.0`, serviceUrl.replace('analytics.', '')).href;
        this.logger.info(({
            message: 'Fetching iterations from azure',
            url: fullUrl,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
            projectId: team.projectId,
            teamId: team.id
        }));
        const data = await this.makeRequest(fullUrl);
        (data.value as Omit<Iteration, 'metadata'>[])
            .forEach(itr => iterations.push({
                ...itr,
                metadata: {
                    orgName: orgName,
                    projectId: team.projectId,
                    teamId: team.id,
                    datasourceType: this.datasourceType
                }
            }));

        return iterations;
    }

    /**
     * Get work items from the iteration. 
     * 
     * https://docs.microsoft.com/en-us/rest/api/azure/devops/work/iterations/get-iteration-work-items?view=azure-devops-rest-6.0&tabs=HTTP
     */
    private async getWorkItemsInIteration({ orgName, projectId, teamId, iterationId }:
        { orgName: string, projectId: string, teamId: string, iterationId: string; }
    ): Promise<string[]> {
        const workItemIds: string[] = [];
        const { url: serviceUrl } = await this.getRunParameters();
        if (!serviceUrl) throw new Error('URL is undefined');
        const fullUrl = new URL(`${orgName}/${projectId}/${teamId}/_apis/work/teamsettings/iterations/${iterationId}/workitems?api-version=6.0-preview.1`, serviceUrl.replace('analytics.', '')).href;
        this.logger.info(({
            message: 'Fetching workitems in iteration from azure',
            url: fullUrl,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
            projectId,
            teamId
        }));
        const data = await this.makeRequest(fullUrl);
        (data.workItemRelations)
            .forEach((workItem: any) => workItemIds.push(workItem.target.id));

        return workItemIds;
    }

    /**
     * - Get all projects
     * - Get teams in projects
     * - Get terations in teams
     * - Get workitems in iterations
     * @returns 
     */
    private async extract(): Promise<Iteration[]> {
        let iterations: Iteration[] = [];
        const projects = await this.getProjectConfigs();

        let promises = [];
        // Get teams in projects
        promises = projects.map(project => {
            return this.getTeams(project.projectId);
        });

        const teamsInProjects = await Promise.all(promises);
        const allTeams = _.flatten(teamsInProjects);

        // Get iterations in teams
        promises = allTeams.map(team => this.getIterations(team));
        const iterationsInTeams = await Promise.all(promises);
        iterations = _.flatten(iterationsInTeams);


        this.logger.info(({
            message: `Fetched ${iterations.length} iterations from ${allTeams.length} teams, from ${projects.length} projects`,
            datasourceType: this.datasourceType,
            datasourceId: this.datasourceId,
            orgId: this.orgId,
        }));

        return iterations;
    }

    /**
     * Transform an Azure Iteration to a Sprint. 
     * 
     * This function also returns the metadata of the sprint thats required for 
     * mapping the sprint to work items
     */
    private transform(sprints: Iteration[]): Array<{ sprint: FlomatikaSprint, metadata: SprintMetadata; }> {
        const strToDateTime = (dateStr: string | undefined): DateTime | undefined => {
            if (dateStr === undefined) return undefined;
            else return DateTime.fromISO(dateStr);
        };
        return sprints.map(as => ({
            sprint: {
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                name: as.name,
                sprintId: as.id,
                startDate: strToDateTime(as.attributes?.startDate),
                endDate: strToDateTime(as.attributes?.finishDate),
                flomatikaCreatedDate: DateTime.now()
            },
            metadata: as.metadata
        }));
    }

    private async loadSprintWorkItemMap(flomatiakSprint: FlomatikaSprint, workItemIds: string[]): Promise<void> {
        for (const workItemId of workItemIds) {
            await this.sprintLoader.processSprintWorkItemMap({
                orgId: flomatiakSprint.orgId,
                datasourceId: flomatiakSprint.datasourceId,
                sprintId: flomatiakSprint.sprintId,
                workItemId
            });
        }
    }


    async mapSprintsToWorkItems(sprint: FlomatikaSprint, metadata: SprintMetadata): Promise<void> {
        try {
            const workItemIds = await this.getWorkItemsInIteration({
                iterationId: sprint.sprintId,
                ...metadata
            });

            this.logger.info(({
                message: `Fetched ${workItemIds.length} work items from sprint ${sprint.sprintId}`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
            }));

            await this.loadSprintWorkItemMap(sprint, workItemIds);

            this.logger.info(({
                message: `Mapped sprint ${sprint.sprintId} to ${workItemIds.length} work items`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
                sprintId: sprint.sprintId,
            }));
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: `Error in Sprints ETL`,
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                orgId: this.orgId,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
            }));
            throw e;
        }

    }

    async process(): Promise<void> {
        try {
            // Extract
            const sprints = await this.extract();
            this.logger.info(({
                message: `Extracted ${sprints.length} sprints from azure`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
            }));

            //Transform
            const flomatikaSprints = this.transform(sprints);

            // Load
            for (const { sprint, metadata } of flomatikaSprints) {
                await this.sprintLoader.processSprint(sprint);

                // Queue sprint to the queue for sprint-work item mapping
                const result = await this.sqsClient.sendMessageToQueue(
                    SPRINT_WORKITEM_MAPPING_QUEUE,
                    { sprint, metadata }
                );
                this.logger.info(({
                    message: `Queued sprint with ID ${sprint.sprintId} for sprint-workitem ID mapping`,
                    sqsResult: result,
                    datasourceType: this.datasourceType,
                    datasourceId: this.datasourceId,
                    orgId: this.orgId,
                }));
            }
            this.logger.info(({
                message: `Loaded ${flomatikaSprints.length} sprints`,
                datasourceType: this.datasourceType,
                datasourceId: this.datasourceId,
                orgId: this.orgId,
            }));
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: `Error in Sprints ETL`,
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
