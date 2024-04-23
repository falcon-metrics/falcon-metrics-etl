import { Op, Sequelize } from 'sequelize';
import { Logger } from 'pino';
import { ProjectModel } from './models/ProjectModel';

export type ProjectItem = {
    orgId: string;
    datasourceId: string;
    projectId: string;
    name: string;
};

export interface IProject {
    getAllProjects(orgId: string, datasourceId: string): Promise<ProjectItem[]>;
    updateProjects(
        orgId: string,
        datasourceId: string,
        projectIds: string[],
        attributes: any,
    ): Promise<void>;
}

export class Project implements IProject {
    protected logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }
    async getAllProjects(
        orgId: string,
        datasourceId: string,
    ): Promise<ProjectItem[]> {
        if (!orgId) throw new Error('getAllProjects. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getAllProjects. Datasource id is mandatory');

        const projectModel = ProjectModel(await this.database, Sequelize);
        const where = {
            orgId,
            datasourceId,
            deletedAt: null,
        };
        const allProjectsDb = await projectModel.findAll({ where });
        const allProjectItems: ProjectItem[] = [];
        allProjectsDb.map((projectDb) => {
            const projectItem = projectDb.toJSON() as ProjectItem;
            allProjectItems.push(projectItem);
        });
        return allProjectItems;
    }
    async updateProjects(
        orgId: string,
        datasourceId: string,
        projectIds: string[],
        attributes: any,
    ): Promise<void> {
        if (!orgId) throw new Error('getAllProjects. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getAllProjects. Datasource id is mandatory');

        const projectModel = ProjectModel(await this.database, Sequelize);
        const where = { orgId, datasourceId, projectId: projectIds };
        const res = await projectModel.update(attributes, { where });
        this.logger.info(
            `[ORG: ${orgId}]: ${res[0]} projects updated with ${JSON.stringify(
                attributes,
            )}`,
        );
    }
}
