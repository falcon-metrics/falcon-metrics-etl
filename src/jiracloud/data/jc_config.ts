import { WorkItemTypeMapItem } from '../../data/work_item_type_aurora';
import { Logger } from 'pino';
import fetch, { Response } from 'node-fetch';
import { setupHeaders } from './utils';
import { IWorkItemTypeMap } from '../../data/work_item_type_aurora';
import { ContextItem, IContext } from '../../data/context_aurora';
import { IProject, Project } from '../../data/project_aurora';
import { DateTime } from 'luxon';
export enum JiraConfigType {
    ISSUE_TYPE,
    FILTER,
    PROJECT,
}
export interface IJCConfig {
    archiveConfig(
        orgId: string,
        datasourceId: string,
        deletedIssueTypeIds: string[],
        configType: JiraConfigType,
    ): Promise<void>;
    getDeletedConfig(
        serviceUrl: string,
        accessCredentials: string,
        savedConfigs: WorkItemTypeMapItem[] | ContextItem[] | string[],
        configType: JiraConfigType,
    ): Promise<string[]>;
    checkAndDeleteInaccessibleConfigs(
        projectIds: string[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        contexts: ContextItem[],
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessCredentials: string,
    ): Promise<{
        projectIds: string[];
        contexts: ContextItem[];
        workItemTypeMaps: WorkItemTypeMapItem[];
    }>;
}

export class JCConfig implements IJCConfig {
    private logger: Logger;
    private workItemTypeMap: IWorkItemTypeMap;
    private context: IContext;
    private project: IProject;

    constructor(opts: {
        logger: Logger;
        workItemTypeMap: IWorkItemTypeMap;
        context: IContext;
        project: IProject;
    }) {
        this.logger = opts.logger;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.context = opts.context;
        this.project = opts.project;
        this.logger = opts.logger;
    }
    private setupHeaders(accessCredentials: string) {
        return setupHeaders(accessCredentials);
    }
    /**
     * @deprecated
     * 
     * Not used anywhere. This call path has some type errors.  
     */
    checkAndDeleteInaccessibleConfigs = async (
        projectIds: string[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        contexts: ContextItem[],
        orgId: string,
        datasourceId: string,
        serviceUrl: string,
        accessCredentials: string,
    ): Promise<{
        projectIds: string[];
        contexts: ContextItem[];
        workItemTypeMaps: WorkItemTypeMapItem[];
    }> => {
        if (process.env.IS_OFFLINE) {
            return {
                projectIds,
                contexts,
                workItemTypeMaps,
            };
        }
        try {
            const unaccessibleProjects = await this.getDeletedConfig(
                serviceUrl,
                accessCredentials,
                projectIds,
                JiraConfigType.PROJECT,
            );
            //filter from the projectIds
            projectIds = projectIds.filter(
                (projectId) => !unaccessibleProjects.includes(projectId),
            );
            this.logger.info({
                message: 'Archived projects',
                archivedProjects: unaccessibleProjects,
                orgId,
                datasourceId
            });
            if (unaccessibleProjects.length) {
                //set those projects to delete
                await this.project.updateProjects(
                    orgId,
                    datasourceId,
                    unaccessibleProjects,
                    { deletedAt: DateTime.utc() },
                );
            }
            const deletedIssueTypeIds = await this.getDeletedConfig(
                serviceUrl,
                accessCredentials,
                workItemTypeMaps,
                JiraConfigType.ISSUE_TYPE,
            );
            this.logger.info({
                message: 'Archived work item type maps',
                deletedIssueTypeIds,
                orgId,
            });
            if (deletedIssueTypeIds.length) {
                await this.archiveConfig(
                    orgId,
                    datasourceId,
                    deletedIssueTypeIds,
                    JiraConfigType.ISSUE_TYPE,
                );
                //---> if there are archived issuetype, removed the workItemTypeMap with that issuetype
                workItemTypeMaps = workItemTypeMaps.filter(
                    (workItemTypeMap) =>
                        !deletedIssueTypeIds.includes(
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            workItemTypeMap.datasourceWorkItemId!,
                        ),
                );
            }
            const deletedContextAddresses = await this.getDeletedConfig(
                serviceUrl,
                accessCredentials,
                contexts,
                JiraConfigType.FILTER,
            );

            this.logger.info({
                message: 'Archived contexts',
                deletedContextAddresses,
                orgId,
            });
            if (deletedContextAddresses.length) {
                await this.archiveConfig(
                    orgId,
                    datasourceId,
                    deletedContextAddresses,
                    JiraConfigType.FILTER,
                );
                contexts = contexts.filter(
                    (context) =>
                        context.contextAddress &&
                        !deletedContextAddresses.includes(
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            context.contextAddress,
                        ),
                );
            }
            return {
                projectIds,
                contexts,
                workItemTypeMaps,
            };
        } catch (error: any) {
            const errorMessage = `${orgId}-${datasourceId}: ${JSON.stringify(
                error.message || error,
            )}`;
            this.logger.error(errorMessage);
            throw Error(errorMessage);
        }
    };
    async getDeletedConfig(
        serviceUrl: string,
        accessCredentials: string,
        savedConfigs: ContextItem[] | any[],
        configType: JiraConfigType,
    ): Promise<string[]> {
        if (configType === JiraConfigType.ISSUE_TYPE) {
            return await this.retrieveDeletedIssueTypeIds(
                serviceUrl,
                accessCredentials,
                // TODO: Fix this type error. Added any for now
                savedConfigs as any,
            );
        } else if (configType === JiraConfigType.FILTER) {
            return await this.retrieveDeletedFilters(
                serviceUrl,
                accessCredentials,
                savedConfigs,
            );
        } else {
            return await this.retrieveDeletedProjects(
                serviceUrl,
                accessCredentials,
                savedConfigs,
            );
        }
    }
    private retrieveDeletedIssueTypeIds = async (
        serviceUrl: string,
        accessCredentials: string,
        workItemTypeMaps: WorkItemTypeMapItem[],
    ) => {
        const issueTypeUrl = serviceUrl.concat('/issuetype');
        const issueTypeResponse = await fetch(issueTypeUrl, {
            headers: this.setupHeaders(accessCredentials),
        });
        if (!issueTypeResponse.ok) {
            throw Error(
                `Error when requesting issue type data ${issueTypeResponse.statusText}, url ${issueTypeUrl}`,
            );
        }
        const issueTypeData = (await issueTypeResponse.json()) as [];

        if (!issueTypeData.length) {
            return [];
        }

        const datasourceIssueTypeIds = issueTypeData.map(
            (issueType: any) => issueType.id,
        );
        const savedDatasourceWorkItemTypeIds = workItemTypeMaps.map(
            (workItemTypeMap) => workItemTypeMap.datasourceWorkItemId,
        );
        const deletedIssueTypeIds = savedDatasourceWorkItemTypeIds.filter(
            (workItemTypeId) =>
                workItemTypeId &&
                !datasourceIssueTypeIds.includes(workItemTypeId),
        ); //----> find the issue type does not exist in existing issue type
        return deletedIssueTypeIds ? (deletedIssueTypeIds as string[]) : [];
    };
    private retrieveDeletedProjects = async (
        serviceUrl: string,
        accessCredentials: string,
        projectIds: any[],
    ) => {
        const projectUrl = serviceUrl.concat(
            '/search?&startAt=0&maxResults=50&jql=project=',
        );
        const deletedProjects: string[] = [];
        //
        for (const projectId of projectIds) {
            const projectResponse = await fetch(
                projectUrl.concat(`${projectId}`),
                {
                    headers: this.setupHeaders(accessCredentials),
                },
            );

            if (!projectResponse.ok) {
                deletedProjects.push(projectId);
            }
        }
        return deletedProjects ? (deletedProjects as string[]) : [];
    };
    private retrieveDeletedFilters = async (
        serviceUrl: string,
        accessCredentials: string,
        contexts: ContextItem[],
    ) => {
        const contextUrl = serviceUrl.concat('/filter');
        //if it is jira server, we need to loop through all of them and make request
        //if didnt find -> add to deleted list
        //to cater jira-server condition
        // const deletedContextAddress: string[] = [];
        const savedContextAddresses = contexts.map(
            (context) => context.contextAddress,
        );
        const headers = this.setupHeaders(accessCredentials);
        const deletedContextAddress: string[] = [];
        //use this to check if we have access to filters
        const favoriteFiltersResponse = await fetch(
            contextUrl.concat('/favourite'),
            { headers },
        );
        if (!favoriteFiltersResponse.ok) {
            throw Error('No permission to access filters');
        }
        for (const savedContextAddress of savedContextAddresses) {
            if (!savedContextAddress) continue;
            const filterResponse = await fetch(
                contextUrl.concat(`/${savedContextAddress}`),
                {
                    headers,
                },
            );
            if (!filterResponse.ok) {
                deletedContextAddress.push(savedContextAddress);
            }
        }
        return deletedContextAddress ? (deletedContextAddress as string[]) : [];
    };
    async archiveConfig(
        orgId: string,
        datasourceId: string,
        deletedIds: string[],
        configType: JiraConfigType,
    ): Promise<void> {
        if (configType === JiraConfigType.ISSUE_TYPE) {
            await this.workItemTypeMap.archiveWorkItemTypeMap(
                orgId,
                datasourceId,
                deletedIds,
            );
        } else if (configType === JiraConfigType.FILTER) {
            await this.context.archiveContexts(orgId, datasourceId, deletedIds);
        }
    }
}
