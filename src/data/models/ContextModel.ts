import { Sequelize } from "sequelize";

export const ContextModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "context",
        {
            contextId: {
                type: type.STRING,
                primaryKey: true,
            },
            orgId: type.STRING,
            datasourceId: type.STRING,
            name: type.STRING,
            positionInHierarchy: type.STRING,
            contextAddress: type.STRING,
            archived: type.BOOLEAN,
            projectId: type.STRING,
            obeyaId: type.STRING,
            reingest: type.BOOLEAN
        },
        {
            indexes: [
                {
                    unique: false,
                    fields: ['datasourceId']
                }
            ]
        },
    );