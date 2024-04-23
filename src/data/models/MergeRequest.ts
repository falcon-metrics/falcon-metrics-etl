import { DataTypes, Sequelize } from "sequelize";

// Merge Request Model Definition
export const MergeRequestModel = (sequelize: Sequelize) => {
    const MergeRequest = sequelize.define('merge_requests', {
        id: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
        },
        title: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        mergeCommitSha: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        projectId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
                model: 'vc_projects',
                key: 'id'
            },
            onDelete: 'CASCADE',
            primaryKey: true
        },
        orgId: {
            type: DataTypes.TEXT,
            allowNull: false,
            primaryKey: true
        },
        sourceBranch: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        targetBranch: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        mrCreatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        mrMergedAt: {
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
        tableName: 'merge_requests'
    });

    return MergeRequest;
};
