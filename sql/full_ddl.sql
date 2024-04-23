-- public.business_scorecard_metric_snapshots definition

-- Drop table

-- DROP TABLE public.business_scorecard_metric_snapshots;

CREATE TABLE public.business_scorecard_metric_snapshots (
	metric_snapshot_id int4 NOT NULL,
	metric_id int4 NULL,
	value float8 NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	CONSTRAINT business_scorecard_metric_snapshots_pkey PRIMARY KEY (metric_snapshot_id)
);


-- public.business_scorecard_metrics definition

-- Drop table

-- DROP TABLE public.business_scorecard_metrics;

CREATE TABLE public.business_scorecard_metrics (
	metric_id varchar NOT NULL,
	metric_name varchar(255) NULL,
	metric_type varchar(255) NULL,
	context_id varchar(255) NULL,
	perspective_id varchar(255) NULL,
	metric_unit varchar(255) NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	target int4 NULL,
	lower_limit int4 NULL,
	upper_limit int4 NULL,
	org_id varchar NULL,
	metric_values jsonb NULL,
	metric_trend_direction varchar NULL,
	CONSTRAINT business_scorecard_metrics_pkey PRIMARY KEY (metric_id)
);


-- public.business_scorecard_perspectives definition

-- Drop table

-- DROP TABLE public.business_scorecard_perspectives;

CREATE TABLE public.business_scorecard_perspectives (
	perspective_id varchar NOT NULL,
	perspective_name varchar(255) NULL,
	org_id varchar(255) NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	CONSTRAINT business_scorecard_perspectives_pkey PRIMARY KEY (perspective_id)
);


-- public.checkpoints_snapshots definition

-- Drop table

-- DROP TABLE public.checkpoints_snapshots;

CREATE TABLE public.checkpoints_snapshots (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	checkpoints_view_id int4 NOT NULL,
	"orgId" varchar(255) NOT NULL,
	context_id text NOT NULL,
	snapshot_date timestamptz NULL,
	lead_time_85 numeric NULL,
	wip_count numeric NULL,
	wip_age_85 numeric NULL,
	fitness_level numeric NULL,
	lead_time_predictability text NULL,
	flow_efficiency numeric NULL,
	stale_work numeric NULL,
	average_throughput numeric NULL,
	delayed_items_count numeric NULL,
	quantile_first numeric NULL,
	quantile_second numeric NULL,
	quantile_third numeric NULL,
	quantile_fourth numeric NULL,
	lead_time_target_met numeric NULL,
	lead_time_portfolio_85 numeric NULL,
	flow_debt numeric NULL,
	total_throughput numeric NULL,
	key_sources_of_delay jsonb NULL,
	lead_time_portfolio_avg numeric NULL,
	lead_time_team_avg numeric NULL,
	wip_age_avg numeric NULL,
	throughput_predictability text NULL,
	profile_of_work jsonb NULL,
	demand_over_capacity_percent numeric NULL,
	inflow_outflow_percent numeric NULL,
	CONSTRAINT insights_checkpoints_snapshots_pkey PRIMARY KEY (id, "orgId", checkpoints_view_id, context_id)
);
CREATE UNIQUE INDEX checkpoints_snapshots_checkpoints_view_id_idx ON public.checkpoints_snapshots USING btree (checkpoints_view_id, "orgId", context_id);


-- public.checkpoints_views definition

-- Drop table

-- DROP TABLE public.checkpoints_views;

CREATE TABLE public.checkpoints_views (
	start_date timestamptz NOT NULL,
	end_date timestamptz NOT NULL,
	"name" text NULL,
	"orgId" varchar(255) NOT NULL,
	id varchar(255) DEFAULT nextval('checkpoints_views_id_seq'::regclass) NOT NULL,
	CONSTRAINT checkpoints_views_pkey PRIMARY KEY (id)
);


-- public."classOfServices" definition

-- Drop table

-- DROP TABLE public."classOfServices";

CREATE TABLE public."classOfServices" (
	"orgId" varchar(255) NULL,
	"displayName" varchar(255) NULL,
	"classOfServiceId" int4 NOT NULL,
	CONSTRAINT "classOfService_pkey" PRIMARY KEY ("classOfServiceId")
);


-- public."comments" definition

-- Drop table

-- DROP TABLE public."comments";

CREATE TABLE public."comments" (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	username varchar(255) NULL,
	context_id varchar(255) NULL,
	"comment" varchar(255) NULL,
	title varchar(100) NULL,
	effective_date timestamptz NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	user_id varchar(255) NULL,
	"parentId" int4 NULL,
	context _jsonb NULL,
	"orgId" varchar(255) NULL,
	"elementField" _jsonb NULL,
	"elementFields" jsonb NULL,
	"uuid" varchar DEFAULT ''::character varying NOT NULL,
	CONSTRAINT comments_pkey PRIMARY KEY (id)
);


-- public.commits definition

-- Drop table

-- DROP TABLE public.commits;

CREATE TABLE public.commits (
	sha text NOT NULL,
	"committedDate" timestamp NOT NULL,
	"committerEmail" text NOT NULL,
	"committerName" text NOT NULL,
	"projectId" text NOT NULL,
	"orgId" text NOT NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"deletedAt" timestamp NULL,
	CONSTRAINT pk_commits PRIMARY KEY (sha, "projectId", "orgId")
);


-- public."contextWorkItemMaps" definition

-- Drop table

-- DROP TABLE public."contextWorkItemMaps";

CREATE TABLE public."contextWorkItemMaps" (
	"contextId" varchar(255) NOT NULL,
	"workItemId" varchar(255) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"orgId" varchar(255) NULL,
	"datasourceId" varchar(255) NULL,
	"extractRunAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT context_workitem_map_pkey PRIMARY KEY ("contextId", "workItemId")
);
CREATE INDEX contextworkitemmaps_idx ON public."contextWorkItemMaps" USING btree ("workItemId");


-- public.contexts definition

-- Drop table

-- DROP TABLE public.contexts;

CREATE TABLE public.contexts (
	"contextId" varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"positionInHierarchy" varchar(255) NOT NULL,
	"contextAddress" text NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"datasourceId" varchar(255) NULL,
	"projectId" varchar(255) NULL,
	archived bool NULL,
	"obeyaId" varchar NULL,
	"cost" int4 NULL,
	reingest bool DEFAULT false NOT NULL,
	CONSTRAINT contexts_pkey PRIMARY KEY ("contextId")
);
CREATE INDEX contexts_datasourceid ON public.contexts USING btree ("datasourceId");


-- public."customFieldConfigs" definition

-- Drop table

-- DROP TABLE public."customFieldConfigs";

CREATE TABLE public."customFieldConfigs" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"datasourceFieldName" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	enabled bool DEFAULT false NOT NULL,
	hidden bool DEFAULT false NOT NULL,
	"projectId" varchar(255) DEFAULT 'default-value'::character varying NOT NULL,
	"deletedAt" timestamptz NULL,
	tags text DEFAULT ''::text NOT NULL,
	CONSTRAINT "customFieldConfigs_pkey" PRIMARY KEY ("orgId", "datasourceId", "datasourceFieldName", "projectId")
);


-- public."customFields" definition

-- Drop table

-- DROP TABLE public."customFields";

CREATE TABLE public."customFields" (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"datasourceFieldName" varchar(255) NOT NULL,
	"datasourceFieldValue" varchar(4000) NULL,
	"displayName" varchar(255) NOT NULL,
	"workItemId" varchar(255) NOT NULL,
	"type" varchar(255) NULL,
	CONSTRAINT "customFields_pkey" PRIMARY KEY (id),
	CONSTRAINT "workItemId_index" UNIQUE ("orgId", "datasourceId", "datasourceFieldName", "datasourceFieldValue", "workItemId")
);
CREATE INDEX customfields_datasourcefieldname_idx ON public."customFields" USING btree ("datasourceFieldName", "datasourceFieldValue", "displayName");
CREATE INDEX customfields_orgid_idx ON public."customFields" USING btree ("orgId");


-- public.custom_dashboard_data definition

-- Drop table

-- DROP TABLE public.custom_dashboard_data;

CREATE TABLE public.custom_dashboard_data (
	"dashboardId" varchar NULL,
	"userId" varchar NULL,
	"dashboardLayout" jsonb NULL,
	"dashboardTitle" varchar NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"dashboardGroups" jsonb NULL,
	"userGroupId" varchar NULL
);


-- public.cwim_dup definition

-- Drop table

-- DROP TABLE public.cwim_dup;

CREATE TABLE public.cwim_dup (
	"contextId" varchar(255) NOT NULL,
	"workItemId" varchar(255) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"orgId" varchar(255) NULL,
	"datasourceId" varchar(255) NULL,
	"extractRunAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT cwim_dup_pkey PRIMARY KEY ("contextId", "workItemId")
);
CREATE INDEX "cwim_dup_workItemId_idx" ON public.cwim_dup USING btree ("workItemId");


-- public."datasourceJobs" definition

-- Drop table

-- DROP TABLE public."datasourceJobs";

CREATE TABLE public."datasourceJobs" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"jobName" varchar(255) NOT NULL,
	"lastRunOn" timestamptz NULL,
	"nextRunStartFrom" timestamptz NULL,
	enabled bool NOT NULL,
	"batchSize" int4 NULL,
	"runDelayMinutes" int4 NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT datasourcejobs_pkey PRIMARY KEY ("orgId", "datasourceId", "jobName")
);


-- public.datasources definition

-- Drop table

-- DROP TABLE public.datasources;

CREATE TABLE public.datasources (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	enabled bool NOT NULL,
	"lastRunOn" timestamptz NULL,
	"nextRunStartFrom" timestamptz NULL,
	"nextSnapshotFillingStartFrom" timestamptz NULL,
	"excludeItemsCompletedBeforeDate" timestamptz NULL,
	"batchSizeStateItems" int4 NULL,
	"runDelayStateMinutes" int4 NULL,
	"accessCredentialsKey" varchar(255) NULL,
	"accessCredentialsType" varchar(255) NULL,
	"runType" varchar(255) NULL,
	"serviceUrl" varchar(255) NULL,
	"datasourceType" varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT datasources_pkey PRIMARY KEY ("orgId", "datasourceId")
);


-- public.events definition

-- Drop table

-- DROP TABLE public.events;

CREATE TABLE public.events (
	username varchar(255) NULL,
	context_id varchar(255) NULL,
	description bpchar(255) NULL,
	event_name varchar(255) NULL,
	efective_date timestamptz NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"updatedAt" time NULL,
	user_id varchar(255) NULL,
	"orgId" varchar(255) NULL,
	CONSTRAINT events_pkey PRIMARY KEY (id),
	CONSTRAINT id UNIQUE (id)
);


-- public.extensions definition

-- Drop table

-- DROP TABLE public.extensions;

CREATE TABLE public.extensions (
	"orgId" varchar(255) NOT NULL,
	"extension" varchar(255) NOT NULL,
	enabled bool NOT NULL
);


-- public."fieldMaps" definition

-- Drop table

-- DROP TABLE public."fieldMaps";

CREATE TABLE public."fieldMaps" (
	"flomatikaFieldName" varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"datasourceFieldName" varchar(255) NOT NULL,
	"datasourceFieldValue" varchar(255) NULL,
	"flomatikaFieldValue" varchar(255) NULL,
	"copyDatasourceValue" bool NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	CONSTRAINT "fieldMaps_pkey" PRIMARY KEY (id)
);


-- public.filters definition

-- Drop table

-- DROP TABLE public.filters;

CREATE TABLE public.filters (
	id int4 DEFAULT nextval('filter_id_seq'::regclass) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NULL,
	"contextId" varchar(255) NULL,
	"displayName" varchar(255) NOT NULL,
	"flomatikaQuery" varchar NOT NULL,
	"parsedQuery" varchar NOT NULL,
	tags varchar(255) NULL,
	"isFavorite" bool DEFAULT false NOT NULL,
	"SLE" int4 NULL,
	target int4 NULL,
	"colorHex" varchar(20) NULL,
	"deletedAt" timestamptz NULL,
	"alsoIncludeChildren" bool DEFAULT false NOT NULL,
	"onlyIncludeChildren" bool DEFAULT false NOT NULL,
	CONSTRAINT filters_pkey PRIMARY KEY (id)
);
CREATE INDEX "filters_orgId_datasourceId_idx" ON public.filters USING btree ("orgId", "datasourceId");


-- public.forecasting_setting_context_capacities definition

-- Drop table

-- DROP TABLE public.forecasting_setting_context_capacities;

CREATE TABLE public.forecasting_setting_context_capacities (
	"orgId" varchar NOT NULL,
	"roomId" varchar NOT NULL,
	"contextId" varchar NOT NULL,
	"capacityPercentage" int4 DEFAULT 100 NULL,
	"contextName" varchar NOT NULL,
	CONSTRAINT forecasting_setting_context_capacities_check CHECK ((("capacityPercentage" >= 0) AND ("capacityPercentage" <= 100))),
	CONSTRAINT forecasting_setting_context_capacities_pk PRIMARY KEY ("orgId", "roomId", "contextId")
);


-- public.forecasting_settings definition

-- Drop table

-- DROP TABLE public.forecasting_settings;

CREATE TABLE public.forecasting_settings (
	"orgId" varchar NOT NULL,
	"roomId" varchar NOT NULL,
	"teamPerformancePercentage" int4 DEFAULT 100 NULL,
	"workExpansionPercentage" int4 NULL,
	"forecastPortfolio" bool DEFAULT true NOT NULL,
	"forecastTeam" bool DEFAULT true NOT NULL,
	"forecastIndividualContributor" bool DEFAULT true NOT NULL,
	"predictiveAnalysisPrecision" text DEFAULT 'day'::text NOT NULL,
	"sampleStartDate" varchar NULL,
	"sampleEndDate" varchar NULL,
	CONSTRAINT forecasting_settings_pk PRIMARY KEY ("orgId", "roomId")
);


-- public.insights_descriptive_analysis definition

-- Drop table

-- DROP TABLE public.insights_descriptive_analysis;

CREATE TABLE public.insights_descriptive_analysis (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	title text NULL,
	CONSTRAINT insights_descriptive_analysis_pkey PRIMARY KEY (id)
);


-- public.insights_descriptive_analysis_evidence definition

-- Drop table

-- DROP TABLE public.insights_descriptive_analysis_evidence;

CREATE TABLE public.insights_descriptive_analysis_evidence (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	descriptive_id int4 NULL,
	description text NULL,
	CONSTRAINT insights_descriptive_analysis_evidence_pkey PRIMARY KEY (id)
);


-- public.insights_diagnostic_analysis definition

-- Drop table

-- DROP TABLE public.insights_diagnostic_analysis;

CREATE TABLE public.insights_diagnostic_analysis (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	title text NULL,
	CONSTRAINT insights_diagnostic_analysis_pkey PRIMARY KEY (id)
);


-- public.insights_diagnostic_analysis_evidence definition

-- Drop table

-- DROP TABLE public.insights_diagnostic_analysis_evidence;

CREATE TABLE public.insights_diagnostic_analysis_evidence (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	diagnostic_id int4 NULL,
	description text NULL,
	CONSTRAINT insights_diagnostic_analysis_evidence_pkey PRIMARY KEY (id)
);


-- public.insights_pattern_descriptive_maps definition

-- Drop table

-- DROP TABLE public.insights_pattern_descriptive_maps;

CREATE TABLE public.insights_pattern_descriptive_maps (
	pattern_id int4 NOT NULL,
	descriptive_id int4 NOT NULL,
	CONSTRAINT insights_pattern_descriptive_map_pkey PRIMARY KEY (pattern_id, descriptive_id)
);


-- public.insights_pattern_diagnostic_maps definition

-- Drop table

-- DROP TABLE public.insights_pattern_diagnostic_maps;

CREATE TABLE public.insights_pattern_diagnostic_maps (
	pattern_id int4 NOT NULL,
	diagnostic_id int4 NOT NULL,
	CONSTRAINT insights_pattern_diagnostic_map_pkey PRIMARY KEY (pattern_id, diagnostic_id)
);


-- public.insights_pattern_prescriptive_maps definition

-- Drop table

-- DROP TABLE public.insights_pattern_prescriptive_maps;

CREATE TABLE public.insights_pattern_prescriptive_maps (
	pattern_id int4 NOT NULL,
	prescriptive_id int4 NOT NULL,
	CONSTRAINT insights_pattern_prescriptive_map_pkey PRIMARY KEY (pattern_id, prescriptive_id)
);


-- public.insights_patterns definition

-- Drop table

-- DROP TABLE public.insights_patterns;

CREATE TABLE public.insights_patterns (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	title text NULL,
	iql text NULL,
	"sql" text NULL,
	CONSTRAINT insights_patterns_title_pkey PRIMARY KEY (id)
);


-- public.insights_prescriptive_analysis definition

-- Drop table

-- DROP TABLE public.insights_prescriptive_analysis;

CREATE TABLE public.insights_prescriptive_analysis (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	title text NULL,
	CONSTRAINT insights_prescriptive_analysis_pkey PRIMARY KEY (id)
);


-- public.insights_snapshots definition

-- Drop table

-- DROP TABLE public.insights_snapshots;

CREATE TABLE public.insights_snapshots (
	id serial4 NOT NULL,
	insights_view_id int4 NULL,
	"orgId" varchar(255) NOT NULL,
	snapshot_date timestamptz NULL,
	lead_time_85 numeric NULL,
	wip_count numeric NULL,
	wip_age_85 numeric NULL,
	fitness_level numeric NULL,
	lead_time_predictability text NULL,
	flow_efficiency numeric NULL,
	context_id text NULL,
	stale_work numeric NULL,
	average_throughput numeric NULL,
	delayed_items_count numeric NULL,
	quantile_first numeric NULL,
	quantile_second numeric NULL,
	quantile_third numeric NULL,
	quantile_fourth numeric NULL,
	lead_time_portfolio_85 numeric NULL,
	flow_debt numeric NULL,
	lead_time_target_met numeric NULL,
	total_throughput numeric NULL,
	key_sources_of_delay jsonb NULL,
	lead_time_portfolio_avg numeric NULL,
	lead_time_team_avg numeric NULL,
	wip_age_avg numeric NULL,
	throughput_predictability text NULL,
	blockers numeric NULL,
	capacity numeric NULL,
	demand numeric NULL,
	discarded_after_start numeric NULL,
	expedite_pcnt numeric NULL,
	inflow numeric NULL,
	outflow numeric NULL,
	value_demand numeric NULL,
	profile_of_work jsonb NULL,
	demand_over_capacity_percent numeric NULL,
	inflow_outflow_percent numeric NULL,
	CONSTRAINT insights_snapshots_pkey PRIMARY KEY (id)
);
CREATE INDEX insights_snapshots_date_desc ON public.insights_snapshots USING btree (snapshot_date DESC NULLS LAST) INCLUDE (snapshot_date);
CREATE UNIQUE INDEX insights_snapshots_insights_view_id_idx ON public.insights_snapshots USING btree (insights_view_id, "orgId", context_id);


-- public.insights_views definition

-- Drop table

-- DROP TABLE public.insights_views;

CREATE TABLE public.insights_views (
	rolling_window_in_days int4 NOT NULL,
	"name" text NOT NULL,
	query_parameters text NOT NULL,
	context_id varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	id serial4 NOT NULL,
	CONSTRAINT insights_views_pkey PRIMARY KEY (id, context_id)
);


-- public.link_map_layouts definition

-- Drop table

-- DROP TABLE public.link_map_layouts;

CREATE TABLE public.link_map_layouts (
	"orgId" varchar NULL,
	"mapLayout" jsonb NULL,
	id varchar NOT NULL,
	CONSTRAINT link_map_layouts_pk PRIMARY KEY (id)
);


-- public.merge_request_commits definition

-- Drop table

-- DROP TABLE public.merge_request_commits;

CREATE TABLE public.merge_request_commits (
	"commitSha" text NOT NULL,
	"mergeRequestId" text NOT NULL,
	"projectId" text NOT NULL,
	"orgId" text NOT NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"deletedAt" timestamp NULL,
	CONSTRAINT pk_merge_request_commits PRIMARY KEY ("commitSha", "mergeRequestId", "orgId", "projectId")
);


-- public."natureOfWorks" definition

-- Drop table

-- DROP TABLE public."natureOfWorks";

CREATE TABLE public."natureOfWorks" (
	"orgId" varchar(255) NULL,
	"displayName" varchar(255) NULL,
	"natureOfWorkId" int4 NOT NULL,
	CONSTRAINT "natureOfWorks_pkey" PRIMARY KEY ("natureOfWorkId")
);


-- public.notifications definition

-- Drop table

-- DROP TABLE public.notifications;

CREATE TABLE public.notifications (
	id varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NULL,
	resource varchar NULL,
	"emailTemplateName" varchar NULL,
	active bool DEFAULT true NULL,
	CONSTRAINT notifications_check CHECK (((type)::text = ANY ((ARRAY['threshold'::character varying, 'eventTrigger'::character varying, 'periodic'::character varying])::text[]))),
	CONSTRAINT notifications_pk PRIMARY KEY (id)
);


-- public.obeya_dependencies definition

-- Drop table

-- DROP TABLE public.obeya_dependencies;

CREATE TABLE public.obeya_dependencies (
	"blockerContextAddress" varchar(255) NULL,
	"createdAt" timestamptz NULL,
	"modifiedAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"name" varchar(255) NULL,
	"roomId" varchar(255) NULL,
	"dependencyId" varchar(255) NOT NULL,
	"orgId" varchar(255) NULL,
	status varchar(255) NULL,
	summary varchar(255) NULL,
	"blockedContextAddress" varchar(255) NULL,
	"blockedName" varchar(255) NULL,
	severity varchar(255) NULL,
	"blockerName" varchar(255) NULL,
	"dateOfImpact" timestamptz NULL,
	"createdBy" varchar(255) NULL,
	"enabledAssociatedItems" bool NULL,
	CONSTRAINT obeya_dependencies_pkey PRIMARY KEY ("dependencyId")
);


-- public."obeya_dependencyItemMaps" definition

-- Drop table

-- DROP TABLE public."obeya_dependencyItemMaps";

CREATE TABLE public."obeya_dependencyItemMaps" (
	"orgId" varchar(255) NULL,
	"datasourceId" varchar(255) NULL,
	"dependencyId" varchar(255) NULL,
	"createdAt" timestamptz NULL,
	"blockerWorkItemId" varchar(255) NULL,
	"blockedWorkItemId" varchar(255) NULL,
	"dependencyMapId" varchar(255) NOT NULL,
	"blockerContextId" varchar(255) NULL,
	"blockerContextName" varchar(255) NULL,
	"blockerWorkItemTitle" varchar(255) NULL,
	"blockedContextId" varchar(255) NULL,
	"blockedContextName" varchar(255) NULL,
	"blockedWorkItemTitle" varchar(255) NULL,
	"roomId" varchar(255) NULL,
	"modifiedAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT obeya_dependency_item_map_pkey PRIMARY KEY ("dependencyMapId")
);


-- public."obeya_iterationsFilters" definition

-- Drop table

-- DROP TABLE public."obeya_iterationsFilters";

CREATE TABLE public."obeya_iterationsFilters" (
	"iterationId" varchar(255) NOT NULL,
	"filterId" varchar(255) NOT NULL,
	"iterationFilterId" varchar(255) NOT NULL,
	CONSTRAINT "obeya_iterationsFilters_pkey" PRIMARY KEY ("iterationId", "filterId")
);


-- public."obeya_keyResults" definition

-- Drop table

-- DROP TABLE public."obeya_keyResults";

CREATE TABLE public."obeya_keyResults" (
	"orgId" varchar(255) NOT NULL,
	"keyResultId" varchar(255) NOT NULL,
	"keyResultDescription" varchar(255) NOT NULL,
	completed bool NOT NULL,
	"parentWorkItemId" varchar(255) NULL,
	"parentWorkItemTitle" varchar NULL,
	"objectiveId" varchar(255) NOT NULL,
	"roomId" varchar(255) NOT NULL,
	"ratingId" varchar(255) NULL,
	"ratingDescription" varchar(255) NULL,
	"includeChildren" bool NULL,
	"includeRelated" bool NULL,
	"includeChildrenOfRelated" bool DEFAULT false NULL,
	"includeChildrenOfChildren" bool DEFAULT false NULL,
	"createdAt" timestamptz DEFAULT now() NULL,
	"updatedAt" timestamptz NULL,
	"childItemLevel" numeric DEFAULT 1 NULL,
	"linkType" text NULL,
	"linkTypes" jsonb NULL,
	"contextId" varchar NULL,
	"parentContextId" varchar NULL,
	"initiativeId" varchar NULL,
	"strategyId" int4 NULL
);


-- public.obeya_objectives definition

-- Drop table

-- DROP TABLE public.obeya_objectives;

CREATE TABLE public.obeya_objectives (
	"objectiveDescription" varchar(255) NOT NULL,
	"ratingId" varchar(255) NOT NULL,
	"ratingDescription" varchar(255) NOT NULL,
	"createdAt" timestamptz DEFAULT now() NULL,
	"roomId" varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"objectiveId" varchar(255) NOT NULL,
	achieved bool NULL,
	"updatedAt" timestamptz DEFAULT now() NULL,
	"contextId" varchar NULL,
	"strategyId" varchar NULL
);


-- public."obeya_okrRatings" definition

-- Drop table

-- DROP TABLE public."obeya_okrRatings";

CREATE TABLE public."obeya_okrRatings" (
	"orgId" varchar(255) NOT NULL,
	"ratingId" varchar(255) NOT NULL,
	"ratingDescription" varchar(255) NOT NULL,
	CONSTRAINT okrrating_pkey PRIMARY KEY ("orgId", "ratingId")
);


-- public.obeya_okr_ratings definition

-- Drop table

-- DROP TABLE public.obeya_okr_ratings;

CREATE TABLE public.obeya_okr_ratings (
	"orgId" varchar(255) NOT NULL,
	"ratingId" varchar(255) NOT NULL,
	"ratingDescription" varchar(255) NOT NULL
);


-- public.obeya_risks definition

-- Drop table

-- DROP TABLE public.obeya_risks;

CREATE TABLE public.obeya_risks (
	"riskId" varchar(255) NOT NULL,
	"name" varchar(255) NULL,
	description varchar(255) NULL,
	"owner" varchar(255) NULL,
	likelihood numeric NULL,
	"impactOnCost" numeric NULL,
	"impactOnSchedule" numeric NULL,
	"riskExposureDays" numeric NULL,
	"riskExposureAmount" numeric NULL,
	status varchar(255) NULL,
	"roomId" varchar(255) NULL,
	"orgId" varchar(255) NULL,
	"createdBy" varchar(255) NULL,
	"createdAt" date NULL,
	"modifiedAt" date NULL,
	"deletedAt" date NULL,
	"ownerName" varchar(255) NULL,
	CONSTRAINT obeya_risks_pkey PRIMARY KEY ("riskId")
);


-- public.obeya_rooms definition

-- Drop table

-- DROP TABLE public.obeya_rooms;

CREATE TABLE public.obeya_rooms (
	"orgId" varchar(255) NOT NULL,
	"roomName" varchar(255) NOT NULL,
	"beginDate" timestamptz NOT NULL,
	"endDate" timestamptz NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"filterId" varchar(255) NULL,
	"flomatikaQuery" varchar NULL,
	"parsedQuery" varchar NULL,
	"roomId" varchar NOT NULL,
	"type" varchar(255) NULL,
	goal varchar(255) NULL,
	"includeRelated" bool DEFAULT false NULL,
	"includeChildren" bool DEFAULT false NULL,
	"includeChildrenOfRelated" bool DEFAULT false NULL,
	"includeChildrenOfChildren" bool DEFAULT false NULL,
	"hierarchyLevel" int4 NULL,
	"excludeQuery" varchar NULL,
	"parsedExcludeQuery" varchar NULL,
	"linkTypes" jsonb NULL,
	"linkType" text NULL,
	"columnId" varchar(255) NULL,
	"contextId" varchar(255) NULL,
	"order" int4 NULL,
	"isFinished" bool NULL,
	"isArchived" bool NULL,
	baselines jsonb NULL,
	"constraintType" varchar(255) NULL,
	"constraintDate" timestamptz NULL,
	dependencies jsonb NULL,
	"ratingId" varchar NULL,
	CONSTRAINT obeya_rooms_pkey PRIMARY KEY ("roomId")
);


-- public.obeya_rooms_bck definition

-- Drop table

-- DROP TABLE public.obeya_rooms_bck;

CREATE TABLE public.obeya_rooms_bck (
	"orgId" varchar(255) NOT NULL,
	"roomName" varchar(255) NOT NULL,
	"beginDate" timestamptz NOT NULL,
	"endDate" timestamptz NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"filterId" varchar(255) NULL,
	"flomatikaQuery" varchar NULL,
	"parsedQuery" varchar NULL,
	"roomId" varchar NOT NULL,
	"type" varchar(255) NULL,
	goal varchar(255) NULL,
	"includeRelated" bool DEFAULT false NULL,
	"includeChildren" bool DEFAULT false NULL,
	"includeChildrenOfRelated" bool DEFAULT false NULL,
	"includeChildrenOfChildren" bool DEFAULT false NULL,
	"hierarchyLevel" int4 NULL,
	"excludeQuery" varchar NULL,
	"parsedExcludeQuery" varchar NULL,
	"linkTypes" jsonb NULL,
	"linkType" text NULL,
	"columnId" varchar(255) NULL,
	"contextId" varchar(255) NULL,
	"order" int4 NULL,
	"isFinished" bool NULL,
	"isArchived" bool NULL,
	CONSTRAINT obeya_rooms_pkey_1 PRIMARY KEY ("roomId")
);


-- public.organisations definition

-- Drop table

-- DROP TABLE public.organisations;

CREATE TABLE public.organisations (
	id varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"isOnTrial" bool DEFAULT true NOT NULL,
	"accountAnniversaryDate" timestamptz NULL,
	"trialStartDate" timestamptz NULL,
	"trialEndDate" timestamptz NULL,
	"createdByUser" varchar(255) NULL,
	"createdDate" timestamptz DEFAULT now() NOT NULL,
	"isPayingAccount" bool DEFAULT false NOT NULL,
	"currentTier" varchar(255) NULL,
	"numberOfBoardsAndAggAvailable" varchar(255) NULL,
	"companySize" varchar(255) NULL,
	country varchar(255) NULL,
	state varchar(255) NULL,
	enterprise varchar(255) NULL,
	"referenceCode" varchar(255) NULL,
	"customerReference" varchar(255) NULL,
	"businessRegNumber" varchar(255) NULL,
	"technicalContact" varchar(255) NULL,
	"billingContact" varchar(255) NULL,
	"needHelp" bool NULL,
	"MSASignedBy" varchar NULL,
	"MSASignedAt" timestamptz(0) NULL,
	"companyDomain" varchar(255) NULL,
	"addressLine1" varchar(255) NULL,
	"addressLine2" varchar(255) NULL,
	city varchar(255) NULL,
	zipcode varchar(255) NULL,
	"seeSampleData" bool NULL,
	CONSTRAINT organisations_pkey PRIMARY KEY (id)
);


-- public.performance_metrics definition

-- Drop table

-- DROP TABLE public.performance_metrics;

CREATE TABLE public.performance_metrics (
	id int4 GENERATED BY DEFAULT AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"orgId" varchar(255) NULL,
	metrics jsonb NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"customViews" jsonb NULL,
	CONSTRAINT "orgId" UNIQUE ("orgId") INCLUDE ("orgId"),
	CONSTRAINT performance_metrics_pkey PRIMARY KEY (id)
);


-- public.portfolios definition

-- Drop table

-- DROP TABLE public.portfolios;

CREATE TABLE public.portfolios (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"orgId" varchar(255) NULL,
	"columnId" varchar(255) NULL,
	"columnName" varchar(255) NULL,
	colour varchar NULL,
	"order" int4 NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT portfolios_pk PRIMARY KEY (id)
);


-- public.portfolios_bck definition

-- Drop table

-- DROP TABLE public.portfolios_bck;

CREATE TABLE public.portfolios_bck (
	"orgId" varchar(255) NULL,
	"columnId" varchar(255) NULL,
	"columnName" varchar(255) NULL,
	colour varchar NULL,
	"order" int4 NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"contextId" varchar(255) NULL,
	id int4 NOT NULL
);


-- public.projects definition

-- Drop table

-- DROP TABLE public.projects;

CREATE TABLE public.projects (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"datasourceType" varchar(255) NOT NULL,
	"projectId" varchar(255) NOT NULL,
	"name" varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	workspace text NULL,
	CONSTRAINT projects_pkey PRIMARY KEY ("orgId", "datasourceId", "datasourceType", "projectId")
);


-- public.relationships definition

-- Drop table

-- DROP TABLE public.relationships;

CREATE TABLE public.relationships (
	id text NOT NULL,
	"orgId" text NOT NULL,
	"fromId" text NOT NULL,
	"fromType" text NOT NULL,
	"toId" text NOT NULL,
	"toType" text NOT NULL,
	"fromName" text NULL,
	"toName" text NULL,
	"linkType" text NULL,
	CONSTRAINT relationships_pkey PRIMARY KEY (id),
	CONSTRAINT relationships_un UNIQUE ("orgId", "fromId", "fromType", "toId", "toType")
);
CREATE INDEX relationships_fromid_idx ON public.relationships USING btree ("fromId");
CREATE UNIQUE INDEX relationships_orgid_idx ON public.relationships USING btree ("orgId", "fromId", "fromType", "toId", "toType");
CREATE INDEX relationships_toid_idx ON public.relationships USING btree ("toId");


-- public.settings definition

-- Drop table

-- DROP TABLE public.settings;

CREATE TABLE public.settings (
	"rollingWindowPeriodInDays" varchar(255) NULL,
	"portfolioDisplayName" varchar(255) DEFAULT 'Portfolio'::character varying NULL,
	"initiativeDisplayName" varchar(255) DEFAULT 'Initiative'::character varying NULL,
	"teamDisplayName" varchar(255) DEFAULT 'Team'::character varying NULL,
	"orgId" varchar(255) NOT NULL,
	"staledItemNumberOfDays" varchar(255) DEFAULT '30'::character varying NOT NULL,
	"logoUrl" varchar(255) NULL,
	timezone varchar(255) NULL,
	"datasourceId" varchar(255) NULL,
	"ingestAssignee" bool DEFAULT false NOT NULL,
	"ingestTitle" bool DEFAULT false NOT NULL,
	"staledItemPortfolioLevelNumberOfDays" varchar(255) NULL,
	"staledItemTeamLevelNumberOfDays" varchar(255) NULL,
	"staledItemIndividualContributorNumberOfDays" varchar(255) NULL,
	"excludeWeekends" bool DEFAULT false NOT NULL,
	CONSTRAINT settings_pkey PRIMARY KEY ("orgId")
);


-- public.snapshots definition

-- Drop table

-- DROP TABLE public.snapshots;

CREATE TABLE public.snapshots (
	id serial4 NOT NULL,
	"workItemId" varchar(255) NULL,
	"flomatikaSnapshotDate" timestamptz NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"changedDate" timestamptz NULL,
	"flomatikaCreatedBy" varchar(255) NULL,
	"flomatikaCreatedDate" timestamptz NULL,
	"flomatikaWorkItemTypeId" varchar(255) NULL,
	"flomatikaWorkItemTypeLevel" varchar(255) NULL,
	"flomatikaWorkItemTypeName" varchar(255) NULL,
	"gs2PartitionKey" varchar(255) NULL,
	"gs2SortKey" varchar(255) NULL,
	"isFiller" bool NULL,
	"partitionKey" varchar(255) NULL,
	revision int4 NULL,
	"sortKey" varchar(255) NULL,
	state varchar(255) NULL,
	"stateCategory" varchar(255) NULL,
	"stateOrder" varchar(255) NULL,
	"stateType" varchar(255) NULL,
	title varchar(255) NULL,
	"workItemType" varchar(255) NULL,
	"assignedTo" varchar(255) NULL,
	"flomatikaWorkItemTypeServiceLevelExpectationInDays" int4 NULL,
	"classOfServiceId" varchar(255) NULL,
	"natureOfWorkId" varchar(255) NULL,
	"valueAreaId" varchar(255) NULL,
	"projectId" varchar(255) NULL,
	"isDelayed" bool DEFAULT false NULL,
	"stepCategory" text NULL,
	resolution text NULL,
	"type" text DEFAULT 'state_change'::text NOT NULL,
	assignee text NULL,
	"blockedReason" text NULL,
	"discardedReason" text NULL,
	flagged bool DEFAULT false NOT NULL,
	CONSTRAINT snapshots_pkey PRIMARY KEY (id)
);
CREATE INDEX snapshots_flomatika_snapshot_date ON public.snapshots USING btree ("flomatikaSnapshotDate");
CREATE INDEX snapshots_idx_pkey_snapshot_date_state_category ON public.snapshots USING btree ("flomatikaSnapshotDate", "stateCategory", "partitionKey");
CREATE INDEX snapshots_isfiller_idx ON public.snapshots USING btree ("isFiller");
CREATE INDEX snapshots_partition_key_flomatika_snapshot_date ON public.snapshots USING btree ("flomatikaSnapshotDate", "partitionKey");
CREATE INDEX snapshots_partitionkey_idx ON public.snapshots USING btree ("partitionKey");
CREATE INDEX snapshots_partitionkey_snapshotdate_idx ON public.snapshots USING btree ("partitionKey", "flomatikaSnapshotDate");
CREATE INDEX snapshots_pkey_flomatikaworkitemtypename ON public.snapshots USING btree ("partitionKey", lower(("flomatikaWorkItemTypeName")::text));
CREATE INDEX snapshots_pkey_snapshot_date_state_category ON public.snapshots USING btree ("partitionKey", "stateCategory", "flomatikaSnapshotDate", lower(("flomatikaWorkItemTypeName")::text), state);
CREATE UNIQUE INDEX snapshots_unique_idx ON public.snapshots USING btree ("partitionKey", "workItemId", type, revision, "flomatikaSnapshotDate");
CREATE INDEX snapshots_work_item_id ON public.snapshots USING btree ("workItemId");
CREATE INDEX snapshots_workitemid_idx ON public.snapshots USING btree ("workItemId", "flomatikaSnapshotDate");


-- public.snapshots_test definition

-- Drop table

-- DROP TABLE public.snapshots_test;

CREATE TABLE public.snapshots_test (
	id serial4 NOT NULL,
	"workItemId" varchar(255) NULL,
	"flomatikaSnapshotDate" timestamptz NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"changedDate" timestamptz NULL,
	"flomatikaCreatedBy" varchar(255) NULL,
	"flomatikaCreatedDate" timestamptz NULL,
	"flomatikaWorkItemTypeId" varchar(255) NULL,
	"flomatikaWorkItemTypeLevel" varchar(255) NULL,
	"flomatikaWorkItemTypeName" varchar(255) NULL,
	"gs2PartitionKey" varchar(255) NULL,
	"gs2SortKey" varchar(255) NULL,
	"isFiller" bool NULL,
	"partitionKey" varchar(255) NULL,
	revision int4 NULL,
	"sortKey" varchar(255) NULL,
	state varchar(255) NULL,
	"stateCategory" varchar(255) NULL,
	"stateOrder" varchar(255) NULL,
	"stateType" varchar(255) NULL,
	title varchar(255) NULL,
	"workItemType" varchar(255) NULL,
	"assignedTo" varchar(255) NULL,
	"flomatikaWorkItemTypeServiceLevelExpectationInDays" int4 NULL,
	"classOfServiceId" varchar(255) NULL,
	"natureOfWorkId" varchar(255) NULL,
	"valueAreaId" varchar(255) NULL,
	"projectId" varchar(255) NULL,
	"isDelayed" bool DEFAULT false NULL,
	"stepCategory" text NULL,
	resolution text NULL,
	"type" text DEFAULT 'state_change'::text NOT NULL,
	"blockedReason" text NULL,
	"discardedReason" text NULL,
	assignee text NULL,
	flagged bool DEFAULT false NOT NULL,
	CONSTRAINT snapshots_test_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX snapshots_test_partitionkey_idx ON public.snapshots_test USING btree ("partitionKey", "workItemId", "flomatikaSnapshotDate", revision, type);


-- public."sprintWorkItemMaps" definition

-- Drop table

-- DROP TABLE public."sprintWorkItemMaps";

CREATE TABLE public."sprintWorkItemMaps" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"sprintId" varchar(255) NOT NULL,
	"workItemId" varchar(255) NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT sprint_workitem_map_pkey PRIMARY KEY ("orgId", "datasourceId", "sprintId", "workItemId")
);
CREATE INDEX sprintworkitemmaps_orgid_idx ON public."sprintWorkItemMaps" USING btree ("orgId", "workItemId");
CREATE INDEX sprintworkitemmaps_sprintid_idx ON public."sprintWorkItemMaps" USING btree ("sprintId");
CREATE INDEX sprintworkitemmaps_workitemid_idx ON public."sprintWorkItemMaps" USING btree ("workItemId");


-- public.sprints definition

-- Drop table

-- DROP TABLE public.sprints;

CREATE TABLE public.sprints (
	id serial4 NOT NULL,
	"orgId" text NOT NULL,
	"datasourceId" text NOT NULL,
	"sprintId" text NOT NULL,
	"name" text NOT NULL,
	"startDate" timestamptz NULL,
	"endDate" timestamptz NULL,
	"flomatikaCreatedDate" timestamptz NOT NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT sprints_pkey PRIMARY KEY ("orgId", "datasourceId", "sprintId")
);


-- public."staleItemNumberOfDays" definition

-- Drop table

-- DROP TABLE public."staleItemNumberOfDays";

CREATE TABLE public."staleItemNumberOfDays" (
	"staledItemNumberOfDays" varchar(255) NULL
);


-- public.states definition

-- Drop table

-- DROP TABLE public.states;

CREATE TABLE public.states (
	id serial4 NOT NULL,
	"partitionKey" varchar(255) NULL,
	"sortKey" varchar(255) NULL,
	"flomatikaWorkItemTypeId" varchar(255) NULL,
	"flomatikaWorkItemTypeLevel" varchar(255) NULL,
	"flomatikaWorkItemTypeName" varchar(255) NULL,
	"workItemId" varchar(255) NULL,
	title varchar(255) NULL,
	"workItemType" varchar(255) NULL,
	state varchar(255) NULL,
	"stateCategory" varchar(255) NULL,
	"stateType" varchar(255) NULL,
	"stateOrder" varchar(255) NULL,
	"assignedTo" varchar(255) NULL,
	"flomatikaWorkItemTypeServiceLevelExpectationInDays" int4 NULL,
	"changedDate" timestamptz NULL,
	"arrivalDate" timestamptz NULL,
	"commitmentDate" timestamptz NULL,
	"departureDate" timestamptz NULL,
	"flomatikaCreatedDate" timestamptz NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"classOfServiceId" varchar(255) NULL,
	"natureOfWorkId" varchar(255) NULL,
	"valueAreaId" varchar(255) NULL,
	"parentId" varchar(255) NULL,
	"customFields" jsonb NULL,
	"projectId" varchar(255) NULL,
	datasourceid varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	"orgId" varchar(255) NULL,
	"linkedItems" jsonb NULL,
	"isDelayed" bool DEFAULT false NULL,
	"stepCategory" text NULL,
	resolution text NULL,
	flagged bool DEFAULT false NOT NULL,
	"targetStart" timestamptz NULL,
	"targetEnd" timestamptz NULL,
	baselines jsonb NULL,
	dependencies jsonb NULL,
	CONSTRAINT states_pkey PRIMARY KEY (id)
);
CREATE INDEX states_custom_fields_json ON public.states USING gin ("customFields");
CREATE INDEX states_filter_departure_index ON public.states USING btree ("partitionKey", "departureDate", "stateCategory", lower(("flomatikaWorkItemTypeName")::text));
CREATE INDEX states_flomatikaworkitemtypename ON public.states USING btree ("partitionKey", lower(("flomatikaWorkItemTypeName")::text), "stateType");
CREATE INDEX states_parentid ON public.states USING btree ("parentId");
CREATE UNIQUE INDEX states_partition_key_sort_key ON public.states USING btree ("partitionKey", "sortKey");
CREATE INDEX states_partition_key_state_category ON public.states USING btree ("partitionKey", "stateCategory");
CREATE INDEX states_partitionkey_idx ON public.states USING btree ("partitionKey");
CREATE INDEX states_title ON public.states USING btree (title);
CREATE INDEX states_title_lower ON public.states USING btree (lower((title)::text));
CREATE INDEX states_work_item_id ON public.states USING btree ("workItemId");


-- public.states_test definition

-- Drop table

-- DROP TABLE public.states_test;

CREATE TABLE public.states_test (
	id serial4 NOT NULL,
	"partitionKey" varchar(255) NULL,
	"sortKey" varchar(255) NULL,
	"flomatikaWorkItemTypeId" varchar(255) NULL,
	"flomatikaWorkItemTypeLevel" varchar(255) NULL,
	"flomatikaWorkItemTypeName" varchar(255) NULL,
	"workItemId" varchar(255) NULL,
	title varchar(255) NULL,
	"workItemType" varchar(255) NULL,
	state varchar(255) NULL,
	"stateCategory" varchar(255) NULL,
	"stateType" varchar(255) NULL,
	"stateOrder" varchar(255) NULL,
	"assignedTo" varchar(255) NULL,
	"flomatikaWorkItemTypeServiceLevelExpectationInDays" int4 NULL,
	"changedDate" timestamptz NULL,
	"arrivalDate" timestamptz NULL,
	"commitmentDate" timestamptz NULL,
	"departureDate" timestamptz NULL,
	"flomatikaCreatedDate" timestamptz NULL,
	"createdAt" timestamptz NOT NULL,
	"updatedAt" timestamptz NOT NULL,
	"classOfServiceId" varchar(255) NULL,
	"natureOfWorkId" varchar(255) NULL,
	"valueAreaId" varchar(255) NULL,
	"parentId" varchar(255) NULL,
	"customFields" jsonb NULL,
	"projectId" varchar(255) NULL,
	datasourceid varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	"orgId" varchar(255) NULL,
	"linkedItems" jsonb NULL,
	"isDelayed" bool DEFAULT false NULL,
	"stepCategory" text NULL,
	resolution text NULL,
	flagged bool DEFAULT false NULL,
	CONSTRAINT states_test_pkey PRIMARY KEY (id)
);
CREATE INDEX states_test_custom_fields_json ON public.states_test USING gin ("customFields");
CREATE INDEX states_test_filter_departure_index ON public.states_test USING btree ("partitionKey", "departureDate", "stateCategory", lower(("flomatikaWorkItemTypeName")::text));
CREATE INDEX states_test_flomatikaworkitemtypename ON public.states_test USING btree ("partitionKey", lower(("flomatikaWorkItemTypeName")::text), "stateType");
CREATE INDEX states_test_parentid ON public.states_test USING btree ("parentId");
CREATE UNIQUE INDEX states_test_partition_key_sort_key ON public.states_test USING btree ("partitionKey", "sortKey");
CREATE INDEX states_test_partition_key_state_category ON public.states_test USING btree ("partitionKey", "stateCategory");
CREATE INDEX states_test_partitionkey_idx ON public.states_test USING btree ("partitionKey");
CREATE INDEX states_test_title ON public.states_test USING btree (title);
CREATE INDEX states_test_title_lower ON public.states_test USING btree (lower((title)::text));
CREATE INDEX states_test_work_item_id ON public.states_test USING btree ("workItemId");


-- public.strategies definition

-- Drop table

-- DROP TABLE public.strategies;

CREATE TABLE public.strategies (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"strategyStatement" varchar NULL,
	"strategyDescription" varchar NULL,
	"relationshipType" varchar NULL,
	relationships jsonb NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"userCreated" varchar NULL,
	"userModified" varchar NULL,
	"orgId" varchar NULL,
	"contextId" varchar NULL,
	"lastUser" varchar NULL,
	"parentStrategicDriverId" varchar NULL,
	"horizonId" varchar NULL,
	new_id varchar DEFAULT ''::character varying NOT NULL,
	"uuid" varchar DEFAULT ''::character varying NOT NULL,
	CONSTRAINT strategies_pkey PRIMARY KEY (id)
);


-- public.table_test definition

-- Drop table

-- DROP TABLE public.table_test;

CREATE TABLE public.table_test (
	count int8 NULL
);


-- public.temp_updates definition

-- Drop table

-- DROP TABLE public.temp_updates;

CREATE TABLE public.temp_updates (
	id varchar NOT NULL,
	"orgId" varchar NULL,
	"initiativeId" varchar NULL,
	"userId" varchar NULL,
	username varchar NULL,
	"feedType" varchar NULL,
	"updateType" varchar NULL,
	"updateMetadata" varchar NULL,
	"updatedAt" timestamptz NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamp NULL,
	"feedImages" jsonb NULL,
	"updateText" varchar NULL,
	"name" varchar NULL,
	"parentId" varchar NULL,
	"updateNotes" varchar NULL,
	reactions varchar NULL,
	CONSTRAINT temp_updates_pkey PRIMARY KEY (id)
);


-- public.test_json definition

-- Drop table

-- DROP TABLE public.test_json;

CREATE TABLE public.test_json (
	work_item_id text NOT NULL,
	json_col1 jsonb NOT NULL,
	test_col_1 varchar(4000) NULL
);


-- public.threshold_notification_subscriptions definition

-- Drop table

-- DROP TABLE public.threshold_notification_subscriptions;

CREATE TABLE public.threshold_notification_subscriptions (
	email varchar NOT NULL,
	"orgId" varchar NOT NULL,
	"notificationId" varchar NOT NULL,
	active bool DEFAULT true NULL,
	threshold numeric(10) NOT NULL,
	"thresholdUnit" varchar NOT NULL,
	"thresholdDirection" varchar NOT NULL,
	"queryParameters" varchar NULL,
	"obeyaRoomId" varchar NOT NULL,
	"userId" varchar NOT NULL,
	id serial4 NOT NULL,
	"targetDate" date NULL,
	CONSTRAINT threshold_notification_subscriptions_check CHECK ((("thresholdUnit")::text = ANY ((ARRAY['day'::character varying, 'week'::character varying, 'month'::character varying, 'percent'::character varying])::text[]))),
	CONSTRAINT threshold_notification_subscriptions_direciton_check CHECK ((("thresholdDirection")::text = ANY ((ARRAY['up'::character varying, 'down'::character varying, 'both'::character varying])::text[]))),
	CONSTRAINT threshold_notification_subscriptions_pk PRIMARY KEY ("orgId", "notificationId", "userId", "obeyaRoomId")
);


-- public.time_horizons definition

-- Drop table

-- DROP TABLE public.time_horizons;

CREATE TABLE public.time_horizons (
	"startDate" timestamptz NOT NULL,
	"endDate" timestamptz NOT NULL,
	title text NULL,
	"orgId" varchar NOT NULL,
	id varchar(255) NOT NULL,
	"visionId" varchar(255) NULL,
	"contextId" varchar(255) NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	CONSTRAINT time_horizons_pkey PRIMARY KEY (id)
);


-- public.updates definition

-- Drop table

-- DROP TABLE public.updates;

CREATE TABLE public.updates (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"orgId" varchar NULL,
	"initiativeId" varchar NULL,
	"userId" varchar NULL,
	username varchar NULL,
	"feedType" varchar NULL,
	"updateType" varchar NULL,
	"updateMetadata" varchar NULL,
	"updatedAt" timestamptz NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamp NULL,
	"feedImages" jsonb NULL,
	"updateText" varchar NULL,
	"name" varchar NULL,
	"parentId" int4 NULL,
	"updateNotes" varchar NULL,
	reactions varchar NULL,
	new_id varchar DEFAULT ''::character varying NOT NULL,
	CONSTRAINT updates_pkey PRIMARY KEY (id)
);


-- public.user_groups definition

-- Drop table

-- DROP TABLE public.user_groups;

CREATE TABLE public.user_groups (
	id varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	description text NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdBy" varchar(255) NOT NULL,
	"updatedAt" timestamp NULL,
	"deletedAt" timestamp NULL,
	CONSTRAINT user_groups_pkey PRIMARY KEY (id)
);


-- public.users definition

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	"orgId" varchar(255) NOT NULL,
	"userId" varchar(255) NOT NULL,
	"firstName" varchar(255) NULL,
	"lastName" varchar(255) NULL,
	email varchar(255) NOT NULL,
	"role" varchar(255) NULL,
	"optInNewsletter" bool NOT NULL,
	"contactForDemo" bool DEFAULT false NOT NULL,
	"termsAndCondSignedAt" timestamptz NULL,
	"hideProductTour" bool DEFAULT false NOT NULL,
	"analyticsDashboardUrl" text NULL,
	"enableDashboardBanner" bool DEFAULT false NULL,
	CONSTRAINT users_pkey PRIMARY KEY ("orgId", "userId")
);


-- public."valueAreas" definition

-- Drop table

-- DROP TABLE public."valueAreas";

CREATE TABLE public."valueAreas" (
	"orgId" varchar(255) NULL,
	"displayName" varchar(255) NULL,
	"valueAreaId" int4 NOT NULL,
	CONSTRAINT "valueAreas_pkey" PRIMARY KEY ("valueAreaId")
);


-- public.vc_projects definition

-- Drop table

-- DROP TABLE public.vc_projects;

CREATE TABLE public.vc_projects (
	"name" text NOT NULL,
	"path" text NOT NULL,
	"sourceType" text NOT NULL,
	"orgId" text NOT NULL,
	"excludeBefore" timestamp NOT NULL,
	"lastRunOn" timestamp NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"deletedAt" timestamp NULL,
	id text NOT NULL,
	url text NOT NULL,
	"mainBranchName" text NOT NULL,
	"nextRunStartsFrom" jsonb DEFAULT '{}'::jsonb NULL,
	"projectId" text NOT NULL,
	CONSTRAINT engg_projects_id_key UNIQUE (id)
);


-- public.vision_strategic_drivers definition

-- Drop table

-- DROP TABLE public.vision_strategic_drivers;

CREATE TABLE public.vision_strategic_drivers (
	id varchar(255) NOT NULL,
	"name" varchar(255) NULL,
	colour varchar(255) NULL,
	icon_name varchar(255) NULL,
	description text NULL,
	vision_id int4 NULL,
	org_id varchar NULL,
	"createdAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"oneLineSummary" varchar NULL,
	CONSTRAINT vision_strategic_drivers_pkey PRIMARY KEY (id)
);


-- public.visions definition

-- Drop table

-- DROP TABLE public.visions;

CREATE TABLE public.visions (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"missionStatement" varchar NULL,
	"visionStatement" varchar NULL,
	"strategicDrivers" jsonb NULL,
	"orgId" varchar NULL,
	"createdAt" timestamptz NULL,
	"deletedAt" timestamptz NULL,
	"updatedAt" timestamptz NULL,
	"iconName" varchar NULL,
	"strategicHorizons" jsonb NULL,
	CONSTRAINT visions_pkey PRIMARY KEY (id)
);


-- public."workItemTypeMaps" definition

-- Drop table

-- DROP TABLE public."workItemTypeMaps";

CREATE TABLE public."workItemTypeMaps" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"workflowId" varchar(255) NOT NULL,
	"workItemTypeId" varchar(255) NOT NULL,
	"datasourceWorkItemId" varchar(255) NOT NULL,
	"projectId" varchar(255) NULL,
	archived bool DEFAULT false NULL,
	"serviceLevelExpectationInDays" int4 DEFAULT 0 NULL,
	"level" varchar NULL,
	"isDistinct" bool DEFAULT false NULL
);
CREATE UNIQUE INDEX workitemtypemaps_orgid_idx ON public."workItemTypeMaps" USING btree ("orgId", "datasourceId", "workflowId", "workItemTypeId", "datasourceWorkItemId", "projectId");


-- public."workItemTypes" definition

-- Drop table

-- DROP TABLE public."workItemTypes";

CREATE TABLE public."workItemTypes" (
	"orgId" varchar(255) NOT NULL,
	"workItemTypeId" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"level" varchar(255) NULL,
	"serviceLevelExpectationInDays" int4 NULL,
	"deletedAt" timestamptz(0) NULL,
	CONSTRAINT "workItemType_pkey" PRIMARY KEY ("orgId", "workItemTypeId")
);


-- public."workflowEvents" definition

-- Drop table

-- DROP TABLE public."workflowEvents";

CREATE TABLE public."workflowEvents" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"workflowId" varchar(255) NOT NULL,
	"arrivalPointOrder" int2 NOT NULL,
	"commitmentPointOrder" int2 NOT NULL,
	"departurePointOrder" int2 NOT NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT "workflowEvents_pkey" PRIMARY KEY ("orgId", "datasourceId", "workflowId")
);


-- public."workflowSteps" definition

-- Drop table

-- DROP TABLE public."workflowSteps";

CREATE TABLE public."workflowSteps" (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"workflowId" varchar(255) NOT NULL,
	id varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"stateCategory" varchar(255) NULL,
	"stateType" varchar(255) NULL,
	"order" varchar(255) NULL,
	active bool NULL,
	"createdAt" timestamptz NULL,
	"createdBy" varchar NULL,
	"projectId" varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	CONSTRAINT workflowsteps_pkey PRIMARY KEY ("orgId", "datasourceId", "workflowId", id, name)
);


-- public.workflows definition

-- Drop table

-- DROP TABLE public.workflows;

CREATE TABLE public.workflows (
	"orgId" varchar(255) NOT NULL,
	"datasourceId" varchar(255) NOT NULL,
	"workflowId" varchar(255) NOT NULL,
	"workflowName" varchar(255) NOT NULL,
	"projectId" varchar(255) NULL,
	"deletedAt" timestamptz NULL,
	"datasourceWorkflowId" text NULL,
	CONSTRAINT workflow_pkey PRIMARY KEY ("orgId", "datasourceId", "workflowId")
);


-- public.group_users definition

-- Drop table

-- DROP TABLE public.group_users;

CREATE TABLE public.group_users (
	"userId" varchar(255) NOT NULL,
	"groupId" varchar(255) NOT NULL,
	"orgId" varchar(255) NOT NULL,
	"addedBy" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp NULL,
	"updatedAt" timestamp NULL,
	CONSTRAINT group_users_pkey PRIMARY KEY ("userId", "groupId", "orgId"),
	CONSTRAINT "group_users_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.user_groups(id) ON DELETE CASCADE
);


-- public.merge_requests definition

-- Drop table

-- DROP TABLE public.merge_requests;

CREATE TABLE public.merge_requests (
	id text NOT NULL,
	title text NOT NULL,
	"mergeCommitSha" text NULL,
	"projectId" text NOT NULL,
	"orgId" text NOT NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"deletedAt" timestamp NULL,
	"sourceBranch" text NOT NULL,
	"targetBranch" text NOT NULL,
	"mrCreatedAt" timestamp NOT NULL,
	"mrMergedAt" timestamp NOT NULL,
	CONSTRAINT merge_requests_composite_pkey PRIMARY KEY ("orgId", "projectId", id),
	CONSTRAINT fk_merge_requests_project FOREIGN KEY ("projectId") REFERENCES public.vc_projects(id) ON DELETE CASCADE
);


-- public.pipelines definition

-- Drop table

-- DROP TABLE public.pipelines;

CREATE TABLE public.pipelines (
	id text NOT NULL,
	"mergeCommitSha" text NULL,
	status text NULL,
	"orgId" text NOT NULL,
	"projectId" text NOT NULL,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	"deletedAt" timestamp NULL,
	"finishedAt" timestamp NOT NULL,
	CONSTRAINT pipelines_pkey PRIMARY KEY (id, "projectId", "orgId"),
	CONSTRAINT fk_pipelines_project FOREIGN KEY ("projectId") REFERENCES public.vc_projects(id) ON DELETE CASCADE
);