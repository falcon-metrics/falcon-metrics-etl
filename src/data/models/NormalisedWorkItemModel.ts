import { Sequelize } from "sequelize";


// CREATE TABLE public."normalisedWorkItems" (
// 	"orgId" varchar(255) NOT NULL,
// 	"datasourceId" varchar(255) NOT NULL,
// 	"contextId" varchar(255) NULL,
// 	"displayName" varchar(255) NOT NULL,
// 	"filterId" int4 NOT NULL,
// 	CONSTRAINT "normalisedWorkItems_pkey" PRIMARY KEY ("orgId", "datasourceId", "filterId")
// );

export const NormalisedWorkItemsModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        "normalisedWorkItems",
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            filterId: {
                type: type.INTEGER,
                primaryKey: true,
            },
            displayName: type.STRING,
            contextId: type.STRING,
        },
        {
            timestamps: false
        }
    );