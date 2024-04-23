import { Sequelize, DataTypes } from 'sequelize';

export const SprintWorkItemMapModel = (sequelize: Sequelize) =>
    sequelize.define('sprintWorkItemMap', {
        orgId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        datasourceId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        sprintId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        workItemId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
    });
