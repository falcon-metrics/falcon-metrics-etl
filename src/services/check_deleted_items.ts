import { Context as AWSContext, SNSEvent } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { IJCIssue, JCIssue } from '../jiracloud/data/jc_issue';
import { ABQuery, IABQuery } from '../azureboards/data/ab_query';
import { Datasource, ServiceDetails } from '../data/datasource_aurora';
import { Logger } from 'pino';
import { Op, Sequelize, Transaction } from 'sequelize';
import { StateModel } from '../data/models/StateModel';
import { asClass } from 'awilix';
import { ContextWorkItemMapModel } from '../workitem/ContextWorkItemMapModel';
import { SnapshotModel } from '../workitem/SnapshotModel';
import { DateTime } from 'luxon';
import { IProject, Project } from '../data/project_aurora';
import { JCConfig } from '../jiracloud/data/jc_config';
import {
    IWorkItemTypeMap,
    WorkItemTypeMap,
} from '../data/work_item_type_aurora';
import { Context } from '../data/context_aurora';
import { ADOResponseLogger } from '../azureboards/process/ab_response_logger';
import { AbConfig } from '../azureboards/data/ab_config';
const BATCH_SIZE = 50;
export type CheckConditions = {
    projects?: string[];
    workItemTypes: string[];
};
enum DatasourceType {
    JIRA_CLOUD = 'jira-cloud',
    JIRA_SERVER = 'jira-server',
    ADO = 'azure-boards',
}
export type GetItemParams = {
    orgId: string;
    datasourceId: string;
    workItemIds: string[];
    runParameters: ServiceDetails;
    batchSize: number;
    extraFilters?: CheckConditions;
};

export class ItemIntegrityProcessor {
    protected logger: Logger;
    private database: Sequelize;
    private jcIssue: IJCIssue;
    private abQuery: IABQuery;
    private project: IProject;
    private workItemTypeMap: IWorkItemTypeMap;
    private datasource: Datasource;
    private orgId: string;
    private datasourceId: string;
    private datasourceType: string;
    constructor(opt: {
        logger: Logger;
        database: Sequelize;
        jcState: JCIssue;
        abQuery: ABQuery;
        datasource: Datasource;
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        project: IProject;
        workItemTypeMap: IWorkItemTypeMap;
    }) {
        this.logger = opt.logger;
        this.database = opt.database;
        this.jcIssue = opt.jcState;
        this.abQuery = opt.abQuery;
        this.datasource = opt.datasource;
        this.orgId = opt.orgId;
        this.datasourceId = opt.datasourceId;
        this.datasourceType = opt.datasourceType;
        this.project = opt.project;
        this.workItemTypeMap = opt.workItemTypeMap;
    }
    ////Azure specific stuff
    ///////////////////////////////////////////////////////////////////////////
    async getAzureProjectIds(orgId: string, datasourceId: string) {
        const projects = await this.project.getAllProjects(orgId, datasourceId);
        return projects.map((projectItem) => projectItem.projectId);
    }

    private formatAzureUrl(serviceUrl: string, projectId: string) {
        //Note: we can also use projectId in the query url
        const formattedUrl = [];
        formattedUrl.push(...[serviceUrl, projectId, '_odata/v2.0']);
        return formattedUrl.join('/');
    }
    /////////////////////////Get check conditions////////////////////
    ///////////////////////////////////////////////////////////////////////////

    async getAzureCheckConditions(
        //Filter the workItemTypeMaps with project Id
        orgId: string,
        datasourceId: string,
        projectId: string,
    ): Promise<CheckConditions> {
        const checkCondition: CheckConditions = {
            workItemTypes: [],
        };

        const workItemTypes = await this.workItemTypeMap.getWorkItemTypeMaps(
            orgId,
            datasourceId,
        );
        const workItemTypeMapsInProject = workItemTypes.filter(
            (workItemType) => workItemType.projectId === projectId,
        );

        const workItemTypeIds = workItemTypeMapsInProject?.map(
            (workItemTypeMapItem) => workItemTypeMapItem.datasourceWorkItemId,
        );
        checkCondition.workItemTypes = workItemTypeIds as string[];
        return checkCondition;
    }
    async getJiraCheckConditions(
        orgId: string,
        datasourceId: string,
    ): Promise<CheckConditions> {
        const checkCondition: CheckConditions = {
            projects: [],
            workItemTypes: [],
        };
        const projects = (
            await this.project.getAllProjects(orgId, datasourceId)
        )?.map((projectItem) => projectItem.projectId);
        const workItemTypes = (
            await this.workItemTypeMap.getWorkItemTypeMaps(orgId, datasourceId)
        )?.map(
            (workItemTypeMapItem) => workItemTypeMapItem.datasourceWorkItemId,
        );
        checkCondition.projects = projects;
        checkCondition.workItemTypes = workItemTypes as string[];
        return checkCondition;
    }
    ///////////////////////////////////////////////////////////////////////////
    /////Fetch work item from datasource, with db work item ids
    ///////////////////////////////////////////////////////////////////////////
    async fetchWorkItemWithJiraAPI(getItemParams: GetItemParams): Promise<any> {
        const {
            orgId,
            datasourceId,
            runParameters,
            workItemIds,
            batchSize,
            extraFilters,
        } = getItemParams;
        if (!runParameters.url || !runParameters.accessToken) return;
        const response = await this.jcIssue.getIssues(
            orgId,
            datasourceId,
            runParameters.url,
            runParameters.accessToken,
            workItemIds,
            batchSize,
            extraFilters,
        );
        const total = response.total;
        const issues = response.issues;
        return { total, issues };
    }
    async fetchWorkItemFromAzureApi(
        getItemParams: GetItemParams,
    ): Promise<any> {
        const results = await this.abQuery.getWorkItemIds(getItemParams);
        return results;
    }

    /////////////////////////Get valid items from datasource////////////////////
    ///////////////////////////////////////////////////////////////////////////
    async getValidJiraItemIdsFromDatasource(
        getItemParams: GetItemParams,
    ): Promise<string[]> {
        let workItemIds: string[] = [];

        const { issues } = await this.fetchWorkItemWithJiraAPI(getItemParams);

        workItemIds = issues.map((issue: any) => issue.key as string);

        return workItemIds;
    }
    async getValidAzureItemIdsFromDatasource(
        getItemParams: GetItemParams,
    ): Promise<string[]> {
        const workItems = await this.fetchWorkItemFromAzureApi(getItemParams);
        const workItemIds = workItems.map((workItem: any) => {
            const workItemId = workItem.WorkItemId;
            if (typeof workItemId === 'number') {
                return workItemId.toString();
            } else {
                return workItemId;
            }
        });
        return workItemIds;
    }
    /////////////////////////Get deleted items////////////////////
    ///////////////////////////////////////////////////////////////////////////
    async getJiraDeletedItems(getItemParams: GetItemParams): Promise<string[]> {
        const { workItemIds, batchSize } = getItemParams;
        const checkConditions = await this.getJiraCheckConditions(
            this.orgId,
            this.datasourceId,
        );
        let i, j;
        const deletedItemsOfDatasource: string[] = [];
        for (i = 0, j = workItemIds.length; i < j; i += batchSize) {
            const batchIdsFromDb = workItemIds.slice(i, i + batchSize);
            const workItemIdsFromDatasource: string[] =
                await this.getValidJiraItemIdsFromDatasource({
                    ...getItemParams,
                    extraFilters: checkConditions,
                    workItemIds: batchIdsFromDb,
                });
            //if not find which ids we have did not return from jira
            const deletedItemsInThisBatch = batchIdsFromDb.filter(
                (workItemIdFromDb: any) =>
                    !workItemIdsFromDatasource.includes(workItemIdFromDb),
            );
            deletedItemsOfDatasource.push(...deletedItemsInThisBatch);
        }
        return deletedItemsOfDatasource;
    }
    async getAzureDeletedItems(
        getItemParams: GetItemParams,
    ): Promise<string[]> {
        ///loop through project outside of the batchSize
        //update the runParameters by formatting the project ids into the serviceUrl
        //get workItems for each project
        const projectIds = await this.getAzureProjectIds(
            getItemParams.orgId,
            getItemParams.datasourceId,
        );

        let i, j;
        const { workItemIds, batchSize, orgId, datasourceId } = getItemParams;
        const deletedItemsOfDatasource: string[] = [];
        for (const projectId of projectIds) {
            const runParameters = getItemParams.runParameters;
            const newRunParameters = {
                ...runParameters,
                url: this.formatAzureUrl(runParameters.url!, projectId),
            };
            getItemParams.runParameters = newRunParameters;
            const checkConditions = await this.getAzureCheckConditions(
                orgId,
                datasourceId,
                projectId,
            );
            for (i = 0, j = workItemIds.length; i < j; i += batchSize) {
                const batchIdsFromDb = workItemIds.slice(i, i + batchSize);
                const workItemIdsFromDatasource: string[] =
                    await this.getValidAzureItemIdsFromDatasource({
                        ...getItemParams,
                        extraFilters: checkConditions,
                        workItemIds: batchIdsFromDb,
                    });

                //if not find which ids we have did not return from jira
                const deletedItemsInThisBatch = batchIdsFromDb.filter(
                    (workItemIdFromDb: any) =>
                        !workItemIdsFromDatasource.includes(workItemIdFromDb),
                );
                deletedItemsOfDatasource.push(...deletedItemsInThisBatch);
            }
        }

        return deletedItemsOfDatasource;
    }
    ///////////////////////////////////////////////////////////////////////////
    /////common functions
    ///////////////////////////////////////////////////////////////////////////
    async getRunParameters(
        orgId: string,
        datasourceId: string,
    ): Promise<ServiceDetails | undefined> {
        const runParameters = await this.datasource.getServiceDetails(
            orgId,
            datasourceId,
        );
        if (!runParameters)
            throw new Error('I could not find any datasource parameters');
        return runParameters;
    }

    async getStatesForDatasource(
        orgId: string,
        datasourceId: string,
    ): Promise<string[]> {
        if (!orgId)
            throw new Error('get states from datasource. Org id is mandatory');
        if (!datasourceId) throw new Error('from. Datasource id is mandatory');

        const stateModel = StateModel(await this.database, Sequelize);
        const where = {
            partitionKey: `state#${orgId}`,
            sortKey: {
                [Op.like]: `${datasourceId}%`,
            },
            deletedAt: null,
        };
        //Only select workItemId
        const allStateItems = await stateModel.findAll({
            attributes: ['workItemId'],
            where,
        });

        const allStateItemIds: string[] = [];
        allStateItems.map((stateDb) => {
            const stateItem = stateDb.toJSON() as { workItemId: string };
            allStateItemIds.push(stateItem.workItemId);
        });
        return allStateItemIds;
    }
    async deleteStates(
        orgId: string,
        datasourceId: string,
        stateItemIds: string[],
        transaction: Transaction,
    ): Promise<number> {
        if (!orgId) throw new Error('delete states. Org id is mandatory');
        if (!datasourceId)
            throw new Error('delete states. Datasource id is mandatory');

        const stateModel = StateModel(await this.database, Sequelize);
        const where = {
            partitionKey: `state#${orgId}`,
            sortKey: {
                [Op.like]: `${datasourceId}%`,
            },
            workItemId: stateItemIds,
        };
        const results = await stateModel.update(
            { deletedAt: DateTime.utc() },
            { where, transaction },
        );
        return results[0];
    }
    async deleteSnapshots(
        orgId: string,
        datasourceId: string,
        stateItemIds: string[],
        transaction: Transaction,
    ): Promise<number> {
        if (!orgId) throw new Error('delete snapshots. Org id is mandatory');
        if (!datasourceId)
            throw new Error('delete snapshots. Datasource id is mandatory');

        const snapshotModel = SnapshotModel(await this.database, Sequelize);
        const where = {
            partitionKey: `snapshot#${orgId}`,
            gs2PartitionKey: {
                [Op.like]: `${orgId}#${datasourceId}%`,
            },
            workItemId: stateItemIds,
        };
        const results = await snapshotModel.destroy({ where, transaction });
        return results;
    }
    async deleteContextWorkItemMaps(
        orgId: string,
        datasourceId: string,
        stateItemIds: string[],
        transaction: Transaction,
    ): Promise<number> {
        if (!orgId)
            throw new Error('delete contextWorkItemMaps. Org id is mandatory');
        if (!datasourceId)
            throw new Error(
                'delete contextWorkItemMaps. Datasource id is mandatory',
            );

        const contextWorkItemTypeModel = ContextWorkItemMapModel(
            await this.database,
        );
        const where = {
            orgId,
            workItemId: stateItemIds,
        };
        const results = await contextWorkItemTypeModel.destroy({
            where,
            transaction,
        });
        return results;
    }

    async removeDeletedItems(
        deletedItems: string[],
        transaction: Transaction,
    ): Promise<string> {
        let deleteStateResults = 0;
        let deleteContextWorkItemMapResults = 0;
        let deleteSnapshotsResults = 0;
        const deleteStateResult = await this.deleteStates(
            this.orgId,
            this.datasourceId,
            deletedItems,
            transaction,
        );
        //Delete from snapshots
        const deleteSnapshotResult = await this.deleteSnapshots(
            this.orgId,
            this.datasourceId,
            deletedItems,
            transaction,
        );
        const deleteContextWorkItemMapResult =
            await this.deleteContextWorkItemMaps(
                this.orgId,
                this.datasourceId,
                deletedItems,
                transaction,
            );

        deleteStateResults += deleteStateResult;
        deleteContextWorkItemMapResults += deleteContextWorkItemMapResult;
        deleteSnapshotsResults += deleteSnapshotResult;
        const message = `[JC][${this.orgId}][${
            this.datasourceId
        }] removed ${deleteStateResults} state items, ${deleteSnapshotsResults} snapshot items
                    and ${deleteContextWorkItemMapResults} contextWorkItemMap which are deleted in jira:${JSON.stringify(
                        deletedItems,
                    )}`;
        this.logger.info(message);
        return message;
    }

    async processItemIntegrity() {
        const orgId = this.orgId;
        const datasourceId = this.datasourceId;
        const runParameters = await this.getRunParameters(orgId, datasourceId);
        if (!runParameters) {
            this.logger.error(
                `[JC][${orgId}][${datasourceId}] no valid run type parameter`,
            );
            return;
        }
        //TODO: get projects and work item types and pass in as extra check conditions
        if (runParameters) {
            if (!runParameters.accessToken || !runParameters.url) {
                this.logger.error(
                    `[JC][${orgId}][${datasourceId}] no valid url or access token`,
                );
                return;
            }
            const workItemIdsFromDb = await this.getStatesForDatasource(
                orgId,
                datasourceId,
            );

            //create batches
            const batchSize = BATCH_SIZE;
            this.logger.info(
                `[JC][${orgId}][${datasourceId}]: start checking removed items`,
            );
            const t = await (await this.database).transaction();
            try {
                const getIdParams = {
                    orgId,
                    datasourceId,
                    workItemIds: workItemIdsFromDb,
                    runParameters,
                    batchSize,
                    // extraFilters: checkConditions,
                };
                let deletedItemsOfDatasource: string[] = [];
                if (
                    this.datasourceType === DatasourceType.JIRA_CLOUD ||
                    this.datasourceType === DatasourceType.JIRA_SERVER
                ) {
                    deletedItemsOfDatasource =
                        await this.getJiraDeletedItems(getIdParams);
                } else if (this.datasourceType === DatasourceType.ADO) {
                    deletedItemsOfDatasource =
                        await this.getAzureDeletedItems(getIdParams);
                }
                const message = await this.removeDeletedItems(
                    deletedItemsOfDatasource,
                    t,
                );
                await t.commit();
                return message;
            } catch (error: any) {
                await t.rollback();
                const message = `[${orgId}][${datasourceId}] Check item integrity failed with error ${JSON.stringify(
                    error.message || error,
                )}`;
                this.logger.error(error);
                return message;
            }
        }
    }
}
export const checkItemIntegrity = async (event: SNSEvent) => {
    const container = await getDependencyInjectionContainer(event);
    const logger = container.cradle.logger;

    logger.trace('Got message: %o', event);

    container.register({
        jcState: asClass(JCIssue),
        deleteProcessor: asClass(ItemIntegrityProcessor),
        datasource: asClass(Datasource),
        project: asClass(Project),
        jcConfig: asClass(JCConfig),
        workItemTypeMap: asClass(WorkItemTypeMap),
        context: asClass(Context),
        responseLogger: asClass(ADOResponseLogger),
        abConfig: asClass(AbConfig),
    });
    try {
        await (
            (await container.cradle.deleteProcessor) as ItemIntegrityProcessor
        ).processItemIntegrity();
    } catch (error) {
        logger.error(error);
    }
};
