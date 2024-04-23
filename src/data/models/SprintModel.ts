import { Sequelize } from "sequelize";
import { FlomatikaSprint } from "../../process_interfaces/extract_sprints_process_interface";

type KeysOfFlomatikaSprint = Record<keyof FlomatikaSprint, any>;

export const SprintModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "sprint",
        {
            id: {
                type: type.INTEGER,
                autoIncrement: true,
            },
            orgId: {
                type: type.STRING,
                primaryKey: true
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true
            },
            sprintId: {
                type: type.STRING,
                primaryKey: true
            },
            name: {
                type: type.STRING,
                allowNull: false
            },
            flomatikaCreatedDate: {
                type: type.DATE,
                allowNull: false
            },
            startDate: {
                type: type.DATE,
            },
            endDate: {
                type: type.DATE,
            },
        } as KeysOfFlomatikaSprint,
    );