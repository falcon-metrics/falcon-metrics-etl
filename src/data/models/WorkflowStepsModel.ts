import { Sequelize } from "sequelize";

export const WorkflowStepsModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "workflowStep",
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            workflowId: {
                type: type.STRING,
                primaryKey: true,
            },
            id: {
                type: type.STRING,
                primaryKey: true,
            },
            name: {
                type: type.STRING,
                primaryKey: true,
            },
            stateCategory: type.STRING,
            stateType: type.STRING,
            order: type.INTEGER,
            active: type.BOOLEAN,
            createdAt: type.DATE,
            createdBy: type.STRING,
            projectId: type.STRING,
        },
        {
            timestamps: false
        }
    );