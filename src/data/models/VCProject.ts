import { DataTypes, Sequelize } from "sequelize";

export const VCProjectModel = (sequelize: Sequelize) => {
    const VCProject = sequelize.define('vc_projects', {
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        path: {
            type: DataTypes.STRING,
            allowNull: false
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false
        },
        mainBranchName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        sourceType: {
            type: DataTypes.STRING,
            allowNull: false
        },
        orgId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        excludeBefore: {
            type: DataTypes.DATE,
            allowNull: false
        },
        lastRunOn: {
            type: DataTypes.DATE,
            allowNull: true
        },
        nextRunStartsFrom: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        timestamps: false
    });

    return VCProject;
};

