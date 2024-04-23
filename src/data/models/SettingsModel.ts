import { Sequelize, DataTypes } from 'sequelize';

export const SettingsModel = (sequelize: Sequelize) =>
    sequelize.define(
        'setting',
        {
            orgId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            rollingWindowPeriodInDays: DataTypes.STRING,
            portfolioDisplayName: DataTypes.STRING,
            initiativeDisplayName: DataTypes.STRING,
            teamDisplayName: DataTypes.STRING,
            staledItemNumberOfDays: DataTypes.STRING,
            logoUrl: DataTypes.STRING,
            timezone: DataTypes.STRING,
            ingestAssignee: { 
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            ingestTitle: { 
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
        },
        {
            timestamps: false,
        },
    );