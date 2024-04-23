/* eslint-disable prettier/prettier */
import { Op, Sequelize } from 'sequelize';
import { Logger } from 'pino';
import { DatasourceModel } from './models/DatasourceModel';
import { checkIfNowPastDueDate } from '../utils/date_utils';
import { DatasourceSecret } from '../secrets/datasource_secret';
import { DatasourceJobsModel } from './models/DatasourceJobsModel';
import { SettingsModel } from './models/SettingsModel';

import {
    isDev,
    datasourceId as devDatasourceId,
    orgId as devOrgId
} from '../utils/dev';

export type DatasourceJob = {
    orgId: string;
    datasourceId: string;
    jobName: string;
    lastRunOn?: Date;
    nextRunStartFrom?: Date;
    enabled: boolean;
    batchSize: number;
    runDelayMinutes: number;
};

export type ServiceDetails = {
    /**
     * Base URL
     */
    baseUrl?: string;
    /**
     * URL with the project name
     */
    url?: string;
    accessToken?: string;
    isStateExtractDue: boolean;
    isRevisionExtractDue: boolean;
    batchSizeStateItems?: number;
    batchSizeRevisionItems?: number;
    nextRunStartFrom?: string;
    excludeItemsCompletedBeforeDate?: string;
    nextSnapshotFillingStartFrom?: string;
    runDelayInMinutes: number;
    datasourceType: string;
};

export type DatasourceItem = {
    orgId: string;
    datasourceId: string;
    datasourceType: string;
    runType?: string;
    enabled?: boolean;
    excludeItemsCompletedBeforeDate?: string;
};

export type PrivateFields = {
    orgId: string;
    ingestAssignee: boolean;
    ingestTitle: boolean;
};
export interface IDatasource {
    getAll(): Promise<Array<DatasourceItem>>;
    getDeleted(): Promise<Array<DatasourceItem>>;
    getServiceDetails(
        orgId: string,
        datasourceId: string,
    ): Promise<ServiceDetails | undefined>;
    updateStateLastRun(
        orgId: string,
        datasourceId: string,
        runDate: string,
        nextStartFrom: string,
    ): Promise<void>;
    updateStateBatchSize(
        orgId: string,
        datasourceId: string,
        newBatchSize: number,
    ): Promise<void>;
    getJobs(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<DatasourceJob>>;
    getSettings(
        orgId: string
    ): Promise<PrivateFields>;
    getDatasource(orgId: string, datasourceId: string): Promise<DatasourceItem>;
}

const CREDENTIALS_TYPE_SECRETS_MANAGER = 'secretsManager';
export class Datasource implements IDatasource {
    protected logger: Logger;
    private database: any;
    private secret: DatasourceSecret;

    constructor(opt: {
        logger: Logger,
        database: any,
        datasourceSecret: DatasourceSecret,
    }) {
        this.logger = opt.logger;
        this.database = opt.database;
        this.secret = opt.datasourceSecret;
        this.logger = opt.logger;
    }

    async getSettings(orgId: string): Promise<PrivateFields> {

        const settingsModel = SettingsModel(await this.database);
        let where: Record<string, any> = { orgId };
        if (isDev) {
            where = {
                orgId: devOrgId,
                datasourceId: devDatasourceId
            };
        }
        const settings: any = await settingsModel.findOne({
            where
        });

        return settings?.toJSON() as PrivateFields;
    }

    async getJobs(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<DatasourceJob>> {

        const jobModel = DatasourceJobsModel(await this.database, Sequelize);

        let where: Record<string, any> = {
            orgId,
            datasourceId,
            enabled: true
        };
        if (isDev) {
            where = {
                orgId: devOrgId,
                datasourceId: devDatasourceId
            };
        }
        const jobsDb: any = await jobModel.findAll({
            where
        });

        const jobs: Array<DatasourceJob> = [];
        for (const job of jobsDb) {
            const jobItem = job.toJSON() as DatasourceJob;
            jobs.push({
                orgId: jobItem.orgId,
                datasourceId: jobItem.datasourceId,
                jobName: jobItem.jobName,
                lastRunOn: jobItem.lastRunOn,
                nextRunStartFrom: jobItem.nextRunStartFrom,
                enabled: jobItem.enabled,
                batchSize: jobItem.batchSize,
                runDelayMinutes: jobItem.runDelayMinutes,
            });
        }
        return jobs;
    }

    async getServiceDetails(
        orgId: string,
        datasourceId: string,
    ): Promise<ServiceDetails | undefined> {
        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        const datasourceItem = await datasourceModel.findOne({
            where: {
                orgId,
                datasourceId
            }
        });

        if (!datasourceItem) return undefined;
        const nextRunStartFrom: string | undefined = datasourceItem.nextRunStartFrom === null
            ? undefined
            : datasourceItem.nextRunStartFrom;

        const result: ServiceDetails = {
            url: datasourceItem.serviceUrl,
            accessToken: await this.workOutAccessToken(
                orgId,
                datasourceId,
                datasourceItem.accessCredentialsKey,
                datasourceItem.accessCredentialsType,
            ),
            isStateExtractDue: checkIfNowPastDueDate(
                datasourceItem.lastRunOn,
                datasourceItem.runDelayStateMinutes,
            ),
            isRevisionExtractDue: false,
            batchSizeRevisionItems: datasourceItem.batchSizeRevisionItems,
            batchSizeStateItems: datasourceItem.batchSizeStateItems,
            nextRunStartFrom,
            excludeItemsCompletedBeforeDate:
                datasourceItem.excludeItemsCompletedBeforeDate,
            nextSnapshotFillingStartFrom: datasourceItem.nextSnapshotFillingStartFrom,
            runDelayInMinutes: datasourceItem.runDelayStateMinutes,
            datasourceType: datasourceItem.datasourceType,
        };

        return result;
    }
    async getDeleted(): Promise<DatasourceItem[]> {
        const items: Array<DatasourceItem> = new Array<DatasourceItem>();
        const where: any = {
            deletedAt: {
                [Op.ne]: null
            },
        };

        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        const datasourceItems = await datasourceModel.findAll({
            where
        });

        for (const datasourceItem of datasourceItems) {
            items.push({
                orgId: datasourceItem.orgId,
                datasourceId: datasourceItem.datasourceId,
                runType: datasourceItem.runType,
                enabled: datasourceItem.enabled,
                excludeItemsCompletedBeforeDate: datasourceItem.excludeItemsCompletedBeforeDate,
                datasourceType: datasourceItem.datasourceType
            });
        }

        return items;


    }
    async getAll(): Promise<DatasourceItem[]> {
        const items: Array<DatasourceItem> = new Array<DatasourceItem>();

        let where: Record<string, any> = {
            enabled: true
        };
        if (isDev) {
            where = {
                orgId: devOrgId,
                datasourceId: devDatasourceId
            };
        }

        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        const datasourceItems = await datasourceModel.findAll({
            where
        });

        for (const datasourceItem of datasourceItems) {
            items.push({
                orgId: datasourceItem.orgId,
                datasourceId: datasourceItem.datasourceId,
                runType: datasourceItem.runType,
                enabled: datasourceItem.enabled,
                excludeItemsCompletedBeforeDate: datasourceItem.excludeItemsCompletedBeforeDate,
                datasourceType: datasourceItem.datasourceType
            });
        }

        return items;
    }

    async updateStateLastRun(
        orgId: string,
        datasourceId: string,
        runDate: string,
        nextStartFrom: string,
    ) {
        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        const datasourceItem = await datasourceModel.findOne({
            where: {
                orgId,
                datasourceId
            }
        });

        if (!datasourceItem) {
            throw new Error(
                `Could not find datasource ${datasourceId} for update`,
            );
        }

        this.logger.info({
            message: `next snapshot filling will start from: ${nextStartFrom}`,
        });

        if (!isDev) {
            await datasourceItem.update({
                lastRunOn: new Date(runDate),
                nextRunStartFrom: new Date(nextStartFrom)
            });
        }
    }
    async updateStateBatchSize(
        orgId: string,
        datasourceId: string,
        newBatchSize: number,
    ): Promise<void> {
        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        await datasourceModel.update({
            batchSizeStateItems: newBatchSize,
        }, {
            where: {
                orgId,
                datasourceId
            }
        });
    }

    private async workOutAccessToken(
        orgId: string,
        datasourceId: string,
        credentialsKey: string,
        credentialsType: string,
    ): Promise<string | undefined> {
        if (isDev) {
            const token = process.env[credentialsKey];
            if (!token)
                throw new Error(
                    `Environment variable '${credentialsKey}' is missing or undefined for org:datasource ${orgId}:${datasourceId}`,
                );

            return token;
        } else if (credentialsType === CREDENTIALS_TYPE_SECRETS_MANAGER) {
            const token = await this.secret.getToken(orgId, datasourceId);
            if (!token)
                throw new Error(
                    `Could not find secret for org: ${orgId}, datasource ${datasourceId}`,
                );

            return token;
        }

        return undefined;
    }

    async getDatasource(orgId: string, datasourceId: string): Promise<DatasourceItem> {
        const items: Array<DatasourceItem> = new Array<DatasourceItem>();
        const where: any = {
            // enabled: true,
            orgId,
            datasourceId,
        };

        const datasourceModel = DatasourceModel(await this.database, Sequelize);

        const datasourceItem = await datasourceModel.findOne({
            where
        });

        return {
            orgId: datasourceItem.orgId,
            datasourceId: datasourceItem.datasourceId,
            runType: datasourceItem.runType,
            enabled: datasourceItem.enabled,
            excludeItemsCompletedBeforeDate: datasourceItem.excludeItemsCompletedBeforeDate,
            datasourceType: datasourceItem.datasourceType
        };
    }

}
