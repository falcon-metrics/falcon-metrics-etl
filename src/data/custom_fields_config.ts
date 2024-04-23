import { Logger } from 'pino';
import { Op, Sequelize } from 'sequelize';
import { CustomFieldConfigModel } from './models/CustomFieldConfigModel';

export type CustomFieldConfig = {
    orgId: string;
    datasourceId: string;
    /**
     * ID of the custom field in the datasource
     */
    datasourceFieldName: string;
    displayName: string;
    type: string;
    enabled: boolean;
    hidden: boolean;
    projectId?: string;
};

export const BLOCKED_REASON_TAG = 'blocked_reason';
export const DISCARDED_REASON_TAG = 'discarded_reason';
export const AZURE_BLOCKED_FIELD_TAG = 'azure_blocked_field';

export interface ICustomFieldConfigs {
    getCustomFieldConfigs(
        orgId: string,
        datasourceId: string,
        projectId?: string,
    ): Promise<Array<CustomFieldConfig>>;

    getByType(
        orgId: string,
        datasourceId: string,
        type: string,
    ): Promise<Array<CustomFieldConfig>>;

    saveCustomFieldConfig(config: CustomFieldConfig): Promise<void>;
    getCustomFieldByTag(
        orgId: string,
        datasourceId: string,
        tag: string,
    ): Promise<string | undefined>;
}

export class CustomFieldConfigs implements ICustomFieldConfigs {
    protected logger: Logger;
    private database: Sequelize;
    private cache: Map<string, CustomFieldConfig[]> = new Map();

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async saveCustomFieldConfig(config: CustomFieldConfig): Promise<void> {
        const customFieldConfigsModel = CustomFieldConfigModel(
            await this.database,
            Sequelize,
        );

        await customFieldConfigsModel.upsert(config);

        return;
    }

    async getByType(
        orgId: string,
        datasourceId: string,
        type: string,
    ): Promise<CustomFieldConfig[]> {
        const customFieldConfigsModel = CustomFieldConfigModel(
            await this.database,
            Sequelize,
        );

        const customFieldConfigsDb = await customFieldConfigsModel.findAll({
            where: {
                orgId,
                datasourceId,
                type,
                enabled: true,
            },
        });

        if (!customFieldConfigsDb) {
            return [];
        }

        const allConfigs: Array<CustomFieldConfig> = [];

        for (const config of customFieldConfigsDb) {
            const customFieldConfig: CustomFieldConfig = {
                orgId: config.orgId,
                datasourceId: config.datasourceId,
                datasourceFieldName: config.datasourceFieldName,
                displayName: config.displayName,
                type: config.type,
                enabled: config.enabled,
                hidden: config.hidden,
            };
            allConfigs.push(customFieldConfig);
        }

        return allConfigs;
    }

    async getCustomFieldConfigs(
        orgId: string,
        datasourceId: string,
        projectId?: string,
    ): Promise<CustomFieldConfig[]> {
        const cacheKey = `${orgId}#${datasourceId}#${projectId ?? ''}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        const customFieldConfigs: CustomFieldConfig[] = [];
        const customFieldConfigsModel = CustomFieldConfigModel(
            await this.database,
            Sequelize,
        );

        const customFieldsPredicate: any = {
            orgId,
            datasourceId,
            enabled: true,
            deletedAt: null,
        };
        if (projectId) {
            customFieldsPredicate['projectId'] = projectId;
        }
        const allCustomFieldConfigsDb = await customFieldConfigsModel.findAll({
            where: customFieldsPredicate,
        });

        for await (const customFieldConfigDb of allCustomFieldConfigsDb) {
            const customFieldConfig: CustomFieldConfig = {
                orgId: customFieldConfigDb.orgId,
                datasourceId: customFieldConfigDb.datasourceId,
                datasourceFieldName: customFieldConfigDb.datasourceFieldName,
                displayName: customFieldConfigDb.displayName,
                type: customFieldConfigDb.type,
                enabled: customFieldConfigDb.enabled,
                hidden: customFieldConfigDb.hidden,
                projectId: customFieldConfigDb.projectId,
            };
            customFieldConfigs.push(customFieldConfig);
        }

        this.cache.set(cacheKey, customFieldConfigs);
        return customFieldConfigs;
    }

    async getCustomFieldByTag(
        orgId: string,
        datasourceId: string,
        tag: string,
    ): Promise<string | undefined> {
        let fieldName;
        const sequelize = await this.database;
        const model = CustomFieldConfigModel(sequelize, Sequelize);
        const result = await model.findOne({
            where: {
                orgId,
                datasourceId,
                tags: { [Op.iLike]: `%${tag}%` },
                deletedAt: null,
                enabled: true,
            },
        });
        if (result) {
            fieldName = result.datasourceFieldName;
        }
        return fieldName;
    }
}
