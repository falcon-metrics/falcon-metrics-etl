import { DataTypes, Sequelize } from "sequelize";

export const PipelineModel = (sequelize: Sequelize) => {
    const Pipeline = sequelize.define('pipelines', {
        id: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true,
        },
        mergeCommitSha: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        orgId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true,
        },
        projectId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
                model: 'vc_projects',
                key: 'id'
            },
            onDelete: 'CASCADE',
            primaryKey: true,
        },
        finishedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        timestamps: false,
        tableName: 'pipelines'
    });

    return Pipeline;
};
