import { Sequelize, DataTypes } from 'sequelize';

export const CheckpointsViewsModel = (sequelize: Sequelize) =>
    sequelize.define(
        'checkpoints_views',
        {
            id: {
                primaryKey: true,
                type: DataTypes.STRING,
            },
            name: DataTypes.STRING,
            orgId: DataTypes.STRING,
            start_date: DataTypes.DATE,
            end_date: DataTypes.DATE,
        },
        {
            timestamps: false,
        },
    );