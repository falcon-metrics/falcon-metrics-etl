import { Sequelize } from "sequelize";

export const ProjectModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'projects',
        {
            projectId: {
                type: type.STRING,
                primaryKey: true,
            },
            orgId: type.STRING,
            name: type.STRING,
            datasourceId: type.STRING,
            datasourceType: type.STRING,
            deletedAt: type.DATE,
        },
        {
            timestamps: false,
        },
    );
