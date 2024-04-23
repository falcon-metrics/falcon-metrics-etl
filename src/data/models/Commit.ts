import { DataTypes, Sequelize } from "sequelize";

export const CommitModel = (sequelize: Sequelize) => {
    const commit = sequelize.define('commits', {
        sha: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true,
        },
        committedDate: {
            type: DataTypes.DATE,
            allowNull: false
        },
        committerEmail: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        committerName: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        projectId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
                model: 'merge_requests',
                key: 'id'
            },
            onDelete: 'CASCADE',
            primaryKey: true,
        },
        orgId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true,
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
        tableName: 'commits'
    });

    return commit;
};
