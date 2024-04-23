import { Sequelize, DataTypes } from 'sequelize';

export const ContextWorkItemMapModel = (sequelize: Sequelize) =>
    sequelize.define('contextWorkItemMap', {
        contextId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        workItemId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        orgId: DataTypes.STRING,
        datasourceId: DataTypes.STRING,
        extractRunAt: DataTypes.DATE,
    });
