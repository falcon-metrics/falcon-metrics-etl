import { Sequelize } from "sequelize";

export const WorkItemTypeModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'workItemType',
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            workItemTypeId: {
                type: type.STRING,
                primaryKey: true,
            },
            displayName: type.STRING,
            level: type.STRING,
            serviceLevelExpectationInDays: type.INTEGER,
            deletedAt: type.DATE,
        },
        {
            timestamps: false
        }
    );