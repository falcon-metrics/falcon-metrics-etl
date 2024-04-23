import { Logger } from 'pino';
import { Sequelize } from 'sequelize';
import { FieldMapModel } from './models/FieldMapModel';

export type FieldMapItem = {
    datasourceFieldName: string;
    flomatikaFieldName: string;
    copyDatasourceValue?: boolean;
    valueMap: Map<string, string>;
};

export interface IFieldMap {
    getAllDatasourceFieldNamesForOrg(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<string>>;
    getAllMapsForOrgDatasource(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<FieldMapItem>>;
}

export class FieldMap implements IFieldMap {
    protected logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async getAllDatasourceFieldNamesForOrg(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<string>> {
        const fieldMapModel = FieldMapModel(await this.database, Sequelize);

        const fieldMaps = await fieldMapModel.findAll({
            attributes: [
                [
                    Sequelize.fn(
                        'DISTINCT',
                        Sequelize.col('datasourceFieldName'),
                    ),
                    'datasourceFieldName',
                ],
            ],
            where: {
                orgId,
                datasourceId,
            },
        });

        const datasourceFieldNames: Array<string> = [];
        for (const fieldMap of fieldMaps) {
            datasourceFieldNames.push(fieldMap.datasourceFieldName);
        }

        return datasourceFieldNames;
    }

    async getAllMapsForOrgDatasource(
        orgId: string,
        datasourceId: string,
    ): Promise<Array<FieldMapItem>> {
        if (!orgId || !datasourceId || orgId === '' || datasourceId === '') {
            throw new Error(
                'Either orgId or datasourceId are empty or undefined. Both are required.',
            );
        }

        const fieldMapModel = FieldMapModel(await this.database, Sequelize);

        const fieldMaps = await fieldMapModel.findAll({
            where: {
                orgId,
                datasourceId,
            },
        });

        const maps = new Array<FieldMapItem>();
        const mapOfFieldMaps: Map<string, FieldMapItem> = new Map();

        for (const fieldMap of fieldMaps) {
            const key = `${orgId}#${datasourceId}#${fieldMap.flomatikaFieldName}#${fieldMap.datasourceFieldName}#${fieldMap.datasourceFieldValue}`;

            let mapItem: FieldMapItem;

            if (mapOfFieldMaps.has(key)) {
                mapItem = mapOfFieldMaps.get(key)!;
                mapItem.valueMap.set(
                    fieldMap.datasourceFieldValue,
                    fieldMap.flomatikaFieldValue,
                );
            } else {
                mapItem = {
                    datasourceFieldName: fieldMap.datasourceFieldName,
                    flomatikaFieldName: fieldMap.flomatikaFieldName,

                    valueMap: new Map([
                        [
                            fieldMap.datasourceFieldValue,
                            fieldMap.flomatikaFieldValue,
                        ],
                    ]),
                };

                mapOfFieldMaps.set(key, mapItem);
            }
        }

        return [...mapOfFieldMaps.values()];
    }
}
