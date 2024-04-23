export const DatasourceModel = (sequelize: any, type: any) =>
    sequelize.define(
        "datasource",
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            enabled: type.BOOLEAN,

            lastRunOn: type.DATE,
            nextRunStartFrom: type.DATE,
            nextSnapshotFillingStartFrom: type.DATE,

            excludeItemsCompletedBeforeDate: type.DATE,
            batchSizeStateItems: type.INTEGER,
            runDelayStateMinutes: type.INTEGER,

            accessCredentialsKey: type.STRING,
            accessCredentialsType: type.STRING,

            runType: type.STRING,
            serviceUrl: type.STRING,
            datasourceType: type.STRING,
        },
        {
            timestamps: false,
        }
    );