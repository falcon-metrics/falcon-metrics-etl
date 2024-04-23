import { Sequelize } from "sequelize";

export const StateModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "state",
        {
            id: {
                type: type.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },

            flomatikaWorkItemTypeId: type.STRING,
            flomatikaWorkItemTypeLevel: type.STRING,
            flomatikaWorkItemTypeName: type.STRING,

            workItemId: type.STRING,
            title: type.STRING,
            workItemType: type.STRING,

            state: type.STRING,
            stateCategory: type.STRING,
            stateType: type.STRING,
            stateOrder: type.STRING,
            assignedTo: type.STRING,

            flomatikaWorkItemTypeServiceLevelExpectationInDays: type.INTEGER,

            changedDate: type.DATE,
            arrivalDate: type.DATE,
            commitmentDate: type.DATE,
            departureDate: type.DATE,

            flomatikaCreatedDate: type.DATE,
            partitionKey: type.STRING,
            sortKey: type.STRING,

            classOfServiceId: type.STRING,
            natureOfWorkId: type.STRING,
            valueAreaId: type.STRING,

            parentId: type.STRING,

            customFields: type.JSONB,
            projectId: type.STRING,
            deletedAt: type.DATE,

            linkedItems: type.JSONB,
            isDelayed: {
                type: type.BOOLEAN,
                defaultValue: false
            },

            stepCategory: type.STRING,
            resolution: type.STRING,

            /**
             * Set to true when an item is flagged in Jira
             */
            flagged: {
                type: type.BOOLEAN,
                defaultValue: false
            },
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: ['partitionKey', 'sortKey']
                },
                {
                    unique: false,
                    fields: ['workItemId']
                }
            ]
        }
    );