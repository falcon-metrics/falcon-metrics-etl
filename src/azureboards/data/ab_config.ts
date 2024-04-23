import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import { IProject } from '../../data/project_aurora';
import fetch from 'node-fetch';
import btoa from 'btoa';
export enum AbConfigType {
    PROJECT,
}
export interface IAbConfig {
    archiveConfig(
        orgId: string,
        datasourceId: string,
        deletedIssueTypeIds: string[],
        configType: AbConfigType,
    ): Promise<void>;
    getAndUpdateProjectName(
        orgId: string,
        datasourceId: string,
        accessToken: string,
        serviceUrl: string,
        projectId: string,
        projectName: string,
    ): Promise<string>;
}
export class AbConfig implements IAbConfig {
    private logger: Logger;
    private project: IProject;

    constructor(opts: { logger: Logger; project: IProject; }) {
        this.logger = opts.logger;
        this.project = opts.project;
    }

    async archiveConfig(
        orgId: string,
        datasourceId: string,
        configIds: string[],
        configType: AbConfigType,
    ): Promise<void> {
        if (configType === AbConfigType.PROJECT) {
            this.project.updateProjects(orgId, datasourceId, configIds, {
                deletedAt: DateTime.utc(),
            });
        }
    }
    private setupHeaders(accessToken: string) {
        return {
            'Content-Type': 'application/json',
            // Name doesnt matter. can be anything
            Authorization: 'Basic '.concat(btoa('name:'.concat(accessToken))),
        };
    }
    async getAndUpdateProjectName(
        orgId: string,
        datasourceId: string,
        accessToken: string,
        serviceUrl: string,
        projectId: string,
        projectName: string,
    ): Promise<string> {
        const orgName = serviceUrl.split('/').pop();
        if (!orgName)
            throw Error(
                `[ADO][${orgId}]Get org name error from service url ${serviceUrl}`,
            );
        const datasourceProjectName = await this.getProjectName(
            orgId,
            accessToken,
            orgName,
            projectId,
        );
        if (datasourceProjectName !== projectName) {
            const where = {
                orgId,
                datasourceId,
                projectId,
            };
            await this.updateProjectName(where, datasourceProjectName);
        }
        return datasourceProjectName;

    }
    private async getProjectName(
        orgId: string,
        accessToken: string,
        orgName: string,
        projectId: string,
    ): Promise<string> {
        if (!projectId.length) {
            throw Error(`[ADO][${orgId}]Project id cannot be empty`);
        }
        const projectUrl = `https://dev.azure.com/${orgName}/_apis/projects/${projectId}`;
        const projectResponse = await fetch(projectUrl, {
            method: 'GET',
            headers: this.setupHeaders(accessToken),
        });
        if (!projectResponse.ok) {
            throw Error(
                `[ADO][${orgId}]Getting project name fetch error with status ${projectResponse.statusText}, 
                url is ${projectUrl}`,
            );
        }
        const data = await projectResponse.json();
        const { name } = data;
        if (!name)
            throw Error(
                `[ADO][${orgId}]Project ${projectId} name is not found`,
            );
        return name;
    }
    private async updateProjectName(
        projectFilter: {
            orgId: string;
            datasourceId: string;
            projectId: string;
        },
        newName: string,
    ) {
        await this.project.updateProjects(
            projectFilter.orgId,
            projectFilter.datasourceId,
            [projectFilter.projectId],
            {
                name: newName,
            },
        );
    };
}
