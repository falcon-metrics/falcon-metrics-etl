import { Sequelize } from 'sequelize';

// CREATE TABLE public.filters (
// 	id int4 NOT NULL DEFAULT nextval('filter_id_seq'::regclass),
// 	"orgId" varchar(255) NOT NULL,
// 	"datasourceId" varchar(255) NOT NULL,
// 	"contextId" varchar(255) NULL,
// 	"displayName" varchar(255) NOT NULL,
// 	"flomatikaQuery" varchar NOT NULL,
// 	"parsedQuery" varchar NOT NULL,
// 	tags varchar(255) NULL,
// 	"isFavorite" bool NOT NULL DEFAULT false,
// 	"SLE" int4 NULL,
// 	"Target" int4 NULL,
// 	CONSTRAINT filters_pkey PRIMARY KEY (id)
// );
// CREATE INDEX "filters_orgId_datasourceId_idx" ON public.filters USING btree ("orgId", "datasourceId");

export const FiltersModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'filters',
        {
            id: {
                type: type.INTEGER,
                primaryKey: true,
            },
            orgId: type.STRING,
            datasourceId: type.STRING,
            displayName: type.STRING,
            contextId: type.STRING,
            flomatikaQuery: type.STRING,
            parsedQuery: type.STRING,
            tags: type.STRING,
            isFavorite: type.BOOLEAN,
            SLE: type.INTEGER,
            Target: type.INTEGER,
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: ['orgId', 'datasourceId'],
                },
            ],
        },
    );