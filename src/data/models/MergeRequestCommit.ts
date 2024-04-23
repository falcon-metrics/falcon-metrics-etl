import { DataTypes, Sequelize } from "sequelize";

export const MergeRequestCommitModel = (sequelize: Sequelize) => {
    const MergeRequestCommits = sequelize.define('merge_request_commits', {
        commitSha: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
        },
        mergeRequestId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
        },
        projectId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
        },
        orgId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
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
        tableName: 'merge_request_commits',

    });

    return MergeRequestCommits;
};
