import { Sequelize } from "sequelize";

export const WorkItemTypeMapModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'workItemTypeMap',
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            workflowId: {
                type: type.STRING,
                primaryKey: true,
            },
            workItemTypeId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceWorkItemId: {
                type: type.STRING,
                primaryKey: true,
            },
            projectId: type.STRING,
            archived: type.BOOLEAN,

            serviceLevelExpectationInDays: type.INTEGER,
        },
        {
            timestamps: false
        }
    );