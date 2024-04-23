import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { URLSearchParams } from "url";
import { Op, Sequelize } from 'sequelize';
import { InsightsSnapshotsModel } from '../../data/models/InsightsSnapshotsModel';
import { InsightsViewsModel } from '../../data/models/InsightsViewsModel';
import { CheckpointsViewsModel } from '../../data/models/CheckpointsViewsModel';
import { CheckpointsSnapshotsModel } from '../../data/models/CheckpointsSnapshotsModel';
import { ContextModel } from '../../data/models/ContextModel';
import { DatasourceModel } from '../../data/models/DatasourceModel';
import _ from 'lodash';

export type CheckpointsView = {
    id: number;
    orgId: string;
    start_date: Date;
    end_date: Date;
    name: string,
};

export type InsightsView = {
    id: number;
    orgId: string;
    name: string,
    query_parameters: string,
    rolling_window_in_days: number,
    checkpoints_view_id?: number,
    context_id: string,
};

export type InsightsSnapshot = {
    insights_view_id: number;
    orgId: string;
    context_id: string | null;
    snapshot_date: Date;
    lead_time_85: number;
    wip_count: number;
    wip_age_85: number;
    fitness_level: number;
    lead_time_predictability: string;
    flow_efficiency: number;
    stale_work: number;
    average_throughput: number;
    flow_debt: number;
    lead_time_portfolio_85: number;
    lead_time_target_met: number;
    throughput_predictability: string;
    total_throughput: number,
    wip_age_avg: number,
    lead_time_team_avg: number,
    lead_time_portfolio_avg: number,
    key_sources_of_delay: Record<string, any>,
    demand_over_capacity_percent: number;
    inflow_outflow_percent: number;
};

export type CheckpointsSnapshot = InsightsSnapshot & {
    checkpoints_view_id: number;
};

export interface IInsightsData {
    getAllCheckpoints(orgIds: string[]): Promise<CheckpointsView[]>;

    getViewsForSlidingWindow(): Promise<Array<InsightsView>>;
    getViewsForFixedDateRange(): Promise<Array<InsightsView>>;
    getViews(orgId?: string): Promise<Array<any>>;

    saveCheckpointsSnapshot(snapshot: CheckpointsSnapshot): Promise<void>;
    saveInsightsSnapshot(snapshot: InsightsSnapshot): Promise<void>;
}

export function makeDateWindowCurrent(queryParams: string, rollingWindowInDays: number): string {

    if (!queryParams || !queryParams.length) {
        return '';
    }

    //example:
    //?departureDateLowerBoundary=2021-12-06&departureDateUpperBoundary=2022-01-12

    const query = new URLSearchParams(queryParams);

    const now = DateTime.utc();
    const departureDateUpperBoundary = now.toSQLDate();
    const departureDateLowerBoundary = now.minus({ days: rollingWindowInDays }).toSQLDate();

    query.set('departureDateUpperBoundary', departureDateUpperBoundary);
    query.set('departureDateLowerBoundary', departureDateLowerBoundary);

    //strips the leading ? if present
    return query.toString();
};

export function makeDateWindowFixed(queryParams: string, startDate: Date, endDate: Date): string {

    if (!queryParams || !queryParams.length) {
        return '';
    }

    //example:
    //?departureDateLowerBoundary=2021-12-06&departureDateUpperBoundary=2022-01-12

    const query = new URLSearchParams(queryParams);

    const departureDateUpperBoundary = DateTime.fromJSDate(endDate).toUTC().toSQLDate()!;
    const departureDateLowerBoundary = DateTime.fromJSDate(startDate).toUTC().toSQLDate()!;

    query.set('departureDateUpperBoundary', departureDateUpperBoundary);
    query.set('departureDateLowerBoundary', departureDateLowerBoundary);

    //strips the leading ? if present
    return query.toString();
};

export function getContextId(queryParams: string): string | null {

    if (!queryParams || !queryParams.length) {
        return null;
    }

    const query = new URLSearchParams(queryParams);
    return query.get('contextId');
}

/**
 * Sets/overwrites the contextId in the given query parameters
 */
export function setContextId(queryParams: string, contextId: string): string {
    const query = new URLSearchParams(queryParams);
    query.set('contextId', contextId);

    //strips the leading ? if present
    return query.toString();
}

export class InsightsData implements IInsightsData {
    private logger: Logger;
    private database: Sequelize;
    private FLOMATIKA_API_TEST = 'flomatika-api-test';

    constructor(opt: { logger: Logger; database: Sequelize; }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async getAllCheckpoints(orgIds: string[]): Promise<CheckpointsView[]> {
        const allCheckpoints: Array<CheckpointsView> = [];
        try {
            const aurora = await this.database;
            const viewsModel = CheckpointsViewsModel(aurora);
            const views: any = await viewsModel.findAll({
                where: {
                    orgId: {
                        [Op.in]: orgIds
                    },
                }
            });

            for (const view of views) {
                const checkpointsView = view as CheckpointsView;
                //date range is fixed in the query parameter field of the insights_view table
                allCheckpoints.push(checkpointsView);
            }
        } catch (e) {
            throw new Error(`Error getting checkpoints in the org with orgIds: ${orgIds}`);
        }
        return allCheckpoints;
    }

    private async getEnabledDatasources(): Promise<string[]> {
        const aurora = await this.database;
        const datasourceModel = DatasourceModel(aurora, Sequelize);
        const enabledDatasources = await datasourceModel.findAll({
            where: {
                [Op.or]: [
                    {
                        enabled: true,
                        deletedAt: null
                    },
                    {
                        orgId: 'flomatika-demo',
                        deletedAt: null
                    }
                ]
            }
        });

        return enabledDatasources.map((ds: any) => ds.datasourceId);

    }

    private async getContexts(orgId?: string): Promise<any[]> {
        const aurora = await this.database;
        const datasourceIds = await this.getEnabledDatasources();
        const contextModel = ContextModel(aurora, Sequelize);
        const where: any = {
            datasourceId: { [Op.in]: datasourceIds },
            archived: false,
            obeyaId: null
        };
        if (orgId) { where.orgId = orgId; }
        const contexts = await contextModel.findAll({
            where
        });
        return contexts;
    }

    /**
     * Get views from all contexts from all enabled data sources
     */
    async getViews(orgId?: string): Promise<Array<any>> {
        const contexts = await this.getContexts(orgId);
        const views = [];
        const orgIdSet = new Set<string>(
            contexts
                .filter(c => {
                    if (orgId) {
                        return c.orgId === orgId;
                    }
                    return true;
                })
                .map((c: any) => c.orgId)
        );

        // contextId, departureDateLowerBoundary, departureDateUpperBoundary get overwritten
        const queryParamsTemplate = 'contextId=0b169e8b-3f13-49da-b10a-3ebb19a1dedc&currentDataAggregation=Weeks&dateAnalysisOption=all&delayedItemsSelection=inventory&departureDateLowerBoundary=2023-04-03&departureDateUpperBoundary=2023-05-09&lang=en-GB&perspective=past&timezone=UTC&workItemLevels=Team';
        const checkpoints = await this.getAllCheckpoints(Array.from(orgIdSet));

        for (const { contextId, orgId, name } of contexts) {
            const queryParams = setContextId(queryParamsTemplate, contextId);
            const viewTemplate: any = { contextId, orgId, contextName: name };
            const checkpointsOfOrg = checkpoints.filter(checkpoint => checkpoint.orgId === orgId);
            for (const checkpoint of checkpointsOfOrg) {
                const checkpointView = Object.assign({}, viewTemplate);
                checkpointView.query_parameters = makeDateWindowFixed(queryParams, checkpoint.start_date, checkpoint.end_date);
                checkpointView.checkpoints_view_id = checkpoint.id;
                checkpointView.checkpoints_view_name = checkpoint.name;

                views.push(checkpointView);
            }

            // Push one more for extracting an insights snapshot for actionable insights
            const insightsView = Object.assign({}, viewTemplate);
            insightsView.query_parameters = makeDateWindowCurrent(
                queryParams,
                30
            );
            views.push(insightsView);
        }

        return views;
    }

    /**
     * 
     * @deprecated
     */
    async getViewsForFixedDateRange(): Promise<Array<InsightsView>> {
        const aurora = await this.database;
        const checkPointViews: Array<InsightsView> = [];
        const viewsModel = InsightsViewsModel(aurora);

        const viewsFromDb: any = await viewsModel.findAll();

        const orgIdSet = new Set<string>(viewsFromDb.map((v: any) => v.orgId));
        const orgCheckpointsMap = new Map<string, CheckpointsView[]>();

        for (const orgId of orgIdSet) {
            const checkpoints = await this.getAllCheckpoints([orgId]);
            orgCheckpointsMap.set(orgId, checkpoints);
        }


        for (const view of viewsFromDb) {
            const checkpoints = orgCheckpointsMap.get(view.orgId);
            if (checkpoints === undefined) {
                throw new Error('checkpoints is undefined');
            }

            const insightsView = view.dataValues as InsightsView;

            for (const checkpoint of checkpoints) {
                const checkpointView = Object.assign({}, insightsView);
                checkpointView.query_parameters = makeDateWindowFixed(insightsView.query_parameters, checkpoint.start_date, checkpoint.end_date);
                checkpointView.checkpoints_view_id = checkpoint.id;

                checkPointViews.push(checkpointView);
            }
        }
        return checkPointViews;
    }

    /**
     * 
     * @deprecated
     */
    async getViewsForSlidingWindow(): Promise<Array<InsightsView>> {
        const aurora = await this.database;
        const allViews: Array<InsightsView> = [];
        const viewsModel = InsightsViewsModel(aurora);
        const views: any = await viewsModel.findAll();

        for (const view of views) {
            const insightsView = view.dataValues as InsightsView;
            if (insightsView.orgId !== this.FLOMATIKA_API_TEST) {
                //updates the date range in the query_param string to be
                //now - rolling window
                insightsView.query_parameters = makeDateWindowCurrent(
                    insightsView.query_parameters,
                    insightsView.rolling_window_in_days
                );
            }
            allViews.push(insightsView);
        }

        return allViews;
    }

    async saveCheckpointsSnapshot(snapshot: CheckpointsSnapshot): Promise<void> {
        const aurora = await this.database;
        const snapshotModel = CheckpointsSnapshotsModel(aurora);

        await snapshotModel.upsert(snapshot);
    }

    async saveInsightsSnapshot(snapshot: InsightsSnapshot): Promise<void> {
        const aurora = await this.database;
        const insightsSnapshotModel = InsightsSnapshotsModel(aurora);

        await insightsSnapshotModel.upsert(snapshot);
    }
}

