import { Sequelize } from "sequelize";

export const DatasourceJobsModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "datasourceJobs",
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            jobName: {
                type: type.STRING,
                primaryKey: true,
            },
            lastRunOn: type.DATE,
            nextRunStartFrom: type.DATE,
            enabled: type.BOOLEAN,
            batchSize: type.INTEGER,
            runDelayMinutes: type.INTEGER,
        },
        {
            timestamps: false,
        }
    );