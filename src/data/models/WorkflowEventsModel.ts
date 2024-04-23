import { Sequelize } from "sequelize";

export const WorkflowEventsModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "workflowEvent",
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
            arrivalPointOrder: type.INTEGER,
            commitmentPointOrder: type.INTEGER,
            departurePointOrder: type.INTEGER,
        },
        {
            timestamps: false
        }
    );