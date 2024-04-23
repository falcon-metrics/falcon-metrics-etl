import { Sequelize, DataTypes } from 'sequelize';

export const NotificationsModel = (sequelize: Sequelize) =>
    sequelize.define(
        'notifications',
        {
            id: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            type: DataTypes.STRING,
            name: DataTypes.STRING,
            resource: DataTypes.STRING,
            emailTemplateName: DataTypes.STRING,
            active: DataTypes.BOOLEAN,
        },
        {
            timestamps: false,
        },
    );
