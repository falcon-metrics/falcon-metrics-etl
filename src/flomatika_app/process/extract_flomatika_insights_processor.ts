import axios from 'axios';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { quantileSeq } from 'mathjs';
import { Logger } from 'pino';
import zlib from 'zlib';
import { ISqsClient } from '../../notifications/sqs_client';
import { IExtractInsightsProcessor } from "../../process_interfaces/extract_insights_process_interface";
import { IAuth0Secret } from '../../secrets/auth0_secret';
import { CheckpointsSnapshot, getContextId, IInsightsData, InsightsSnapshot, InsightsView } from "../data/fl_insights";

export type InsightsQueueItem = {
    view: InsightsView;
    jwt: string;
};
export const INSIGHTS_EXTRACT_QUEUE = 'ExtractPerformanceCheckpointsQueue.fifo';
export class ExtractFlomatikaInsightsProcessor implements IExtractInsightsProcessor {
    private logger: Logger;
    private insightsData: IInsightsData;
    private secrets: IAuth0Secret;
    private sqsClient: ISqsClient;
    private ERROR = 'error';


    constructor(opt: {
        logger: Logger;
        insightsData: IInsightsData;
        secrets: IAuth0Secret;
        sqsClient: ISqsClient;
    }) {
        this.logger = opt.logger;
        this.insightsData = opt.insightsData;
        this.secrets = opt.secrets;
        this.sqsClient = opt.sqsClient;
        this.logger = opt.logger;
    }

    async getProductivityQuantiles(jwt: string, view: InsightsView): Promise<{ first: number; second: number; third: number; fourth: number; }> {
        const data = await this.queryFlomatika('value-stream-management/delivery-management/run-chart', view.query_parameters, jwt);

        const newItemsData = data?.runChartData?.newItemsData?.map((i: any[]) => i[1]);

        if (!newItemsData || !newItemsData.length) {
            return {
                first: 0,
                second: 0,
                third: 0,
                fourth: 0,
            };
        }

        const minimum = Math.min(...newItemsData);
        const quantiles = quantileSeq(newItemsData, 3, false) as Array<number>;

        return {
            first: minimum,
            second: quantiles[0],
            third: quantiles[1],
            fourth: quantiles[2],
        };
    }

    async getClassOfServiceFromApi(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('value-stream-management/delivery-governance/class-of-service', view.query_parameters, jwt);
    }

    async getSourceOfDelayAndWasteFromApi(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('value-stream-management/delivery-governance/source-of-delay-and-waste', view.query_parameters, jwt);
    }

    async getSourceOfDelayAndWasteWasFromApi(jwt: string, view: InsightsView): Promise<any> {
        const query = new URLSearchParams(view.query_parameters);
        query.set('dateAnalysisOption', 'was');

        return this.queryFlomatika('value-stream-management/delivery-governance/source-of-delay-and-waste', query.toString(), jwt);
    }

    async getFitnessCriteriaFromApi(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('value-stream-management/delivery-governance/fitness-criteria', view.query_parameters, jwt);
    }

    async getFitnessCriteriaPortfolioFromApi(jwt: string, view: InsightsView): Promise<any> {
        const query = new URLSearchParams(view.query_parameters);
        query.set('workItemLevels', 'Portfolio');

        return this.queryFlomatika('value-stream-management/delivery-governance/fitness-criteria', query.toString(), jwt);
    }

    private inflateResponse(deflated: string) {
        let inflated = {}, inflatedStr;
        try {
            inflatedStr = zlib.inflateSync(Buffer.from(deflated, 'base64')).toString();
            inflated = JSON.parse(inflatedStr);
        } catch (e) {
            this.logger.error({
                message: 'Error when deflating data',
                deflated,
                inflatedStr,
                errorMessage: e.message,
                errorStack: e.stack,
            });
        }
        return inflated;
    }

    async getFlowOfDemandsFromApi(jwt: string, view: InsightsView): Promise<any> {
        const result = await this.queryFlomatika('value-stream-management/delivery-governance/flow-of-demands', view.query_parameters, jwt);
        const { response } = result;
        if (!response) return result;
        return this.inflateResponse(response);
    }

    async getFlowOfDemandsWasFromApi(jwt: string, view: InsightsView): Promise<any> {
        const query = new URLSearchParams(view.query_parameters);
        query.set('dateAnalysisOption', 'was');
        const result = await this.queryFlomatika('value-stream-management/delivery-governance/flow-of-demands', query.toString(), jwt);
        const { response } = result;
        if (!response) return result;
        return this.inflateResponse(response);
    }

    async getContinuosImprovementsFlowOfDemands(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('value-stream-management/continuous-improvements/flow-of-demands', view.query_parameters, jwt);
    }

    async getLeadTimeFromApi(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('leadtime', view.query_parameters, jwt);
    }

    async getWipFromApi(jwt: string, view: InsightsView): Promise<any> {
        return this.queryFlomatika('wip', view.query_parameters, jwt);
    }

    async getCustomViewsFromApi(jwt: string, view: InsightsView): Promise<string[]> {
        const result = await this.queryFlomatika('value-stream-management/delivery-governance/normalisation-charts-options', view.query_parameters, jwt);
        if (Array.isArray(result)) {
            return result
                .filter(obj => obj.id !== undefined)
                .map(obj => obj.id);
        }
        return [];
    }

    private roundToTwo(n: number) {
        return Math.round(n * 100) / 100;
    }

    async getProfileOfWorkFromApi(jwt: string, view: InsightsView): Promise<any> {
        const result: any = {};
        const customViewTags = await this.getCustomViewsFromApi(jwt, view);
        for (const tag of customViewTags) {
            const normalisationResult = await this.queryFlomatika('value-stream-management/delivery-governance/normalisation-charts', `${view.query_parameters}&tag=${tag}`, jwt);
            const completedWork = normalisationResult.completedWork?.distribution ?? {};
            const completedWorkPercentages: any = {};
            const total = _.sum(_.values(completedWork));
            for (const key of _.keys(completedWork)) {
                completedWorkPercentages[key] =
                {
                    percentage: total ? this.roundToTwo(completedWork[key] * 100 / total) : 0,
                    value: completedWork[key]
                };
            }
            result[tag] = completedWorkPercentages;
        }
        return result;
    }

    getExpeditePcnt(classOfService: any): number {
        const distribution = classOfService?.completedWork?.distribution ?? {};
        const expedite = distribution.Expedite ?? 0;
        const fixedDate = distribution["Fixed Date"] ?? 0;
        const intangible = distribution.Intangible ?? 0;
        const standard = distribution.Standard ?? 0;

        if (expedite && expedite > 0) {
            const total = (expedite + fixedDate + intangible + standard);
            const expeditePcnt: number = expedite / total;
            return expeditePcnt;
        } else {
            return 0;
        }
    }

    getDelayedItemsCount(sourceOfDelayAndWaste: any): number {
        if (sourceOfDelayAndWaste === this.ERROR) return -999999;
        return sourceOfDelayAndWaste?.delayedItems?.count ?? 0;
    }

    getDiscardedAfterStart(sourceOfDelayAndWaste: any): number {
        if (sourceOfDelayAndWaste === this.ERROR) return -999999;
        return sourceOfDelayAndWaste?.discardedAfterStart?.discardedCount ?? 0;
    }

    getFlowDebt(leadTimeTeam85: any, wipAge: any): number {
        if (leadTimeTeam85 === -999999 || wipAge === -999999) return -999999;
        if (leadTimeTeam85 === 0) {
            return 0;
        }
        return 100 * wipAge / leadTimeTeam85;
    }

    getBlockers(sourceOfDelayAndWaste: any): number {
        if (sourceOfDelayAndWaste === this.ERROR) return -999999;
        return sourceOfDelayAndWaste?.blockers?.count ?? 0;
    }

    getStaleWork(sourceOfDelayAndWaste: any): number {
        if (sourceOfDelayAndWaste === this.ERROR) return -999999;
        return sourceOfDelayAndWaste?.staleWork?.staleCount ?? 0;
    }

    getCurrentProductivity(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.productivity?.current ?? 0;
    }

    getValueDemand(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.customerValue?.customerValueWorkPercentage ?? 0;
    }

    getLeadTimePortfolio85(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.speed?.portfolio?.percentile85th ?? 0;
    }

    getLeadTimeTeam85(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.speed?.team?.percentile85th ?? 0;
    }

    getLeadTimeTargetMet(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.serviceLevelExpectation?.serviceLevelExpectation ?? 0;
    }

    getDemand(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.demandVsCapacity?.demand ?? 0;
    }

    getCapacity(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.demandVsCapacity?.capacity ?? 0;
    }

    getInFlow(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.inflowVsOutflow?.inflow ?? 0;
    }

    getOutFlow(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.inflowVsOutflow?.outflow ?? 0;
    }

    getAverageThroughput(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.throughput?.avgThroughput ?? 0;
    }

    getTotalThroughput(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.throughput?.count ?? 0;
    }

    getFitness(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria.serviceLevelExpectation?.serviceLevelExpectation ?? 0;
    }


    getLeadtimePredictability(fitnessCriteria: any): string {
        if (fitnessCriteria === this.ERROR) return '';
        return fitnessCriteria.predictability?.leadtime ?? null;
    }

    getWipAgeBwDates(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands?.avgWipAge?.avgWipAgesBetweenDates ?? 0;
    }

    getWipAge85(sourceOfDelayAndWasteResult: any): number {
        if (sourceOfDelayAndWasteResult === this.ERROR) return -999999;
        return sourceOfDelayAndWasteResult?.flowDebt?.wipAgePercentile85th ?? 0;
    }

    getWipCount(flowOfDemands: any): number {
        if (flowOfDemands === this.ERROR) return -999999;
        return flowOfDemands.wipCount?.count ?? 0;
    }

    getFlowEfficiency(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria.flowEfficiency?.averageOfWaitingTime ?? 0;
    }

    getLeadTimeTeamAvg(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.speed?.team?.average ?? 0;
    }

    getLeadTimePortfolioAvg(fitnessCriteria: any): number {
        if (fitnessCriteria === this.ERROR) return -999999;
        return fitnessCriteria?.speed?.portfolio?.average ?? 0;
    }

    getKeySourcesOfDelay(sourceOfDelayAndWasteResult: any): any {
        if (sourceOfDelayAndWasteResult === this.ERROR) return { error: true };
        return { keySourcesOfDelay: sourceOfDelayAndWasteResult?.keySourcesOfDelay?.keySourcesOfDelay };
    }

    getThroughputPredictability(fitnessCriteria: any): any {
        if (fitnessCriteria === this.ERROR) return '';
        return fitnessCriteria.predictability?.throughput ?? null;
    }

    getDemandOverCapacityPercent(continuosImprovementsFlowOfDemands: any): any {
        if (continuosImprovementsFlowOfDemands === this.ERROR) return -999999;
        return continuosImprovementsFlowOfDemands?.demandVsCapacity?.demandOverCapacityPercent ?? 0;
    }

    getInflowOutflowPercent(continuosImprovementsFlowOfDemands: any): any {
        if (continuosImprovementsFlowOfDemands === this.ERROR) return -999999;
        return continuosImprovementsFlowOfDemands?.inflowVsOutflow?.inflowOverOutflowPercent ?? 0;
    }

    async extractFromView(view: InsightsView, jwt: string): Promise<void> {
        const begin = Date.now();
        const isCheckpointView = view.checkpoints_view_id !== undefined;
        const extractType = isCheckpointView ? 'checkpoint' : 'insight';
        this.logger.info(({
            message: `Starting extract for ${extractType} view`,
            view
        }));
        const orgId = view.orgId;

        const apiResults = await Promise.all([
            this.getClassOfServiceFromApi(jwt, view),
            this.getSourceOfDelayAndWasteFromApi(jwt, view),
            this.getFitnessCriteriaFromApi(jwt, view),
            this.getFlowOfDemandsFromApi(jwt, view),
            this.getProfileOfWorkFromApi(jwt, view),
            this.getFitnessCriteriaPortfolioFromApi(jwt, view),
            this.getSourceOfDelayAndWasteWasFromApi(jwt, view),
            this.getFlowOfDemandsWasFromApi(jwt, view),
            this.getContinuosImprovementsFlowOfDemands(jwt, view)
        ]);

        const classOfServiceResult = apiResults[0];
        const sourceOfDelayAndWasteResult = apiResults[1];
        const fitnessCriteriaResult = apiResults[2];
        const flowOfDemandsResult = apiResults[3];
        const profileOfWorkResult = apiResults[4];
        const fitnessCriteriaPortfolioResult = apiResults[5];
        const sourceOfDelayAndWasteWasResult = apiResults[6];
        const flowOfDemandsWasResult = apiResults[7];
        const continuosImprovementsFlowOfDemandsResult = apiResults[8];

        const responses = {
            classOfServiceResult,
            sourceOfDelayAndWasteResult,
            fitnessCriteriaResult,
            flowOfDemandsResult,
            profileOfWorkResult,
            fitnessCriteriaPortfolioResult,
            sourceOfDelayAndWasteWasResult,
            flowOfDemandsWasResult,
            continuosImprovementsFlowOfDemandsResult
        };

        this.logger.info({
            message: 'All responses',
            responses
        });

        // Log this for debugging
        // this.logger.info(({
        //     message: 'Received API responses',
        //     view,
        //     classOfServiceResult,
        //     sourceOfDelayAndWasteResult,
        //     fitnessCriteriaResult,
        //     flowOfDemandsResult,
        //     leadTimeResult,
        // }));

        const wipCount = this.getWipCount(flowOfDemandsWasResult);
        const avgWipAgeBtwDates = this.getWipAgeBwDates(flowOfDemandsWasResult);
        const wipAge85 = this.getWipAge85(sourceOfDelayAndWasteWasResult);
        const fitnessLevel = this.getFitness(fitnessCriteriaResult);
        const leadTimePredictability = this.getLeadtimePredictability(fitnessCriteriaResult);
        const throughputPredictability = this.getThroughputPredictability(fitnessCriteriaResult);
        const flowEfficiency = this.getFlowEfficiency(fitnessCriteriaResult);

        const valueDemand = this.getValueDemand(fitnessCriteriaResult);
        const demand = this.getDemand(flowOfDemandsResult);
        const capacity = this.getCapacity(flowOfDemandsResult);
        const inFlow = this.getInFlow(flowOfDemandsResult);
        const outFlow = this.getOutFlow(flowOfDemandsResult);
        const averageThroughput = this.getAverageThroughput(flowOfDemandsResult);
        const totalThroughput = this.getTotalThroughput(flowOfDemandsResult);

        const currentProductivity = this.getCurrentProductivity(fitnessCriteriaResult);
        const staleWork = this.getStaleWork(sourceOfDelayAndWasteWasResult);
        const blockers = this.getBlockers(sourceOfDelayAndWasteResult);
        const discardedAfterStart = this.getDiscardedAfterStart(sourceOfDelayAndWasteResult);
        const delayedItemsCount = this.getDelayedItemsCount(sourceOfDelayAndWasteResult);
        /**
         * This is an object. Writing to a JSONB column
         */
        const keySourcesOfDelay = this.getKeySourcesOfDelay(sourceOfDelayAndWasteResult);

        const expeditePcnt = this.getExpeditePcnt(classOfServiceResult);
        const quantiles = await this.getProductivityQuantiles(jwt, view);

        const leadTimeTargetMet = this.getLeadTimeTargetMet(fitnessCriteriaResult);
        const leadTimeTeam85 = this.getLeadTimeTeam85(fitnessCriteriaResult);
        const flowDebt = this.getFlowDebt(leadTimeTeam85, avgWipAgeBtwDates);
        const leadTimeTeamAvg = this.getLeadTimeTeamAvg(fitnessCriteriaResult);

        const leadTimePortfolio85 = this.getLeadTimePortfolio85(fitnessCriteriaPortfolioResult);
        const leadTimePortfolioAvg = this.getLeadTimePortfolioAvg(fitnessCriteriaPortfolioResult);
        const demandOverCapacityPercent = this.getDemandOverCapacityPercent(continuosImprovementsFlowOfDemandsResult);
        const inflowOutflowPercent = this.getInflowOutflowPercent(continuosImprovementsFlowOfDemandsResult);

        const snapshot = {
            insights_view_id: view.id,
            orgId,
            context_id: getContextId(view.query_parameters),
            snapshot_date: DateTime.now().toUTC().toJSDate(),
            checkpoints_view_id: view.checkpoints_view_id,

            lead_time_portfolio_85: leadTimePortfolio85,
            lead_time_85: leadTimeTeam85,
            flow_debt: flowDebt,
            flow_efficiency: flowEfficiency,
            total_throughput: totalThroughput,
            wip_age_85: wipAge85,
            wip_count: wipCount,
            fitness_level: fitnessLevel,
            stale_work: staleWork,
            average_throughput: averageThroughput,
            lead_time_target_met: leadTimeTargetMet,
            wip_age_avg: avgWipAgeBtwDates,
            lead_time_team_avg: leadTimeTeamAvg,
            lead_time_portfolio_avg: leadTimePortfolioAvg,
            key_sources_of_delay: keySourcesOfDelay,
            lead_time_predictability: leadTimePredictability,
            throughput_predictability: throughputPredictability,
            profile_of_work: profileOfWorkResult,
            demand_over_capacity_percent: demandOverCapacityPercent,
            inflow_outflow_percent: inflowOutflowPercent
        };

        // Log this for debugging
        // this.logger.info(({
        //     message: `Saving ${extractType} snapshot`,
        //     snapshot
        // }));

        if (view.checkpoints_view_id) {
            await this.insightsData.saveCheckpointsSnapshot(snapshot as CheckpointsSnapshot);
        } else {
            await this.insightsData.saveInsightsSnapshot(snapshot as InsightsSnapshot);
        }
        const end = Date.now();
        this.logger.info(({
            message: `Finished extract for ${extractType} view and saved view to database`,
            view,
            elapsedTime: `${(end - begin)}ms`
        }));
    }

    private async getJWTsForOrgs(orgIds: string[]): Promise<Array<{ orgId: string, jwt?: string; }>> {
        // Process the org ID in chunks instead of calling the auth0 API for all the org IDs at once
        // Making too many requests concurrently may hit the per-second quota of the API
        // Chunk the org Ids to chunks of 3. The number 3 was chosen arbitrarily
        const orgIdChunks = _.chunk(orgIds, 3);
        const jwts: Array<{ orgId: string, jwt?: string; }> = [];
        for (const chunk of orgIdChunks) {
            const jwtsForChunk: Array<{ orgId: string, jwt?: string; }> = await Promise.all(
                chunk
                    .map(async (orgId) => {
                        let jwt;
                        try {
                            // If this call fails jwt is undefined
                            jwt = await this.getJWTFromAuth0(orgId);
                        } catch (e) {
                            this.logger.error(({
                                message: `Error fetching JWT token for orgId: ${orgId}`,
                                orgId,
                                errorMessage: (e as Error).message,
                                errorStack: (e as Error).stack,
                            }));
                        }
                        return {
                            orgId,
                            jwt
                        };
                    })
            );
            jwtsForChunk.forEach(jwt => jwts.push(jwt));
        }
        return jwts;
    }

    async extractInsights(orgId?: string): Promise<void> {
        if (orgId) {
            this.logger.info(({
                message: `Extracting insights for org ${orgId}`
            }));
        }
        const allViews = await this.insightsData.getViews(orgId);

        let orgIds = allViews.map(v => v.orgId);
        if (orgId) {
            orgIds = orgIds.filter(o => o === orgId);
        }
        const orgIdSet = new Set(orgIds);
        const jwts = await this.getJWTsForOrgs(Array.from(orgIdSet));
        this.logger.info(({
            // Count only where jwt is not undefined
            message: `Fetched ${jwts.filter(j => j.jwt !== undefined).length} JWT tokens`
        }));

        const orgIdJwtMap = jwts
            .reduce(
                (accum, { orgId, jwt }) => {
                    // If the call to get jwt failed, this will be undefined
                    if (jwt) { accum.set(orgId, jwt); }
                    return accum;
                },
                new Map()
            );

        const promises = [];
        for (const view of allViews) {
            const jwt = orgIdJwtMap.get(view.orgId);
            if (jwt) {
                const queueItem: InsightsQueueItem = { view: view, jwt };
                const promise = this.sqsClient.sendMessageToFIFOQueue(
                    INSIGHTS_EXTRACT_QUEUE,
                    queueItem,
                    'INSIGHTS_EXTRACT'
                );
                promises.push(promise);
            }
        }
        await Promise.all(promises);

        this.logger.info({
            message: 'Queued insights view on SQS',
            orgId,
            count: promises.length
        });
    }

    async getJWTFromAuth0(orgId: string): Promise<any> {

        const CLIENT_ID = await this.secrets.getClientId();
        const CLIENT_SECRET = await this.secrets.getClientSecret();

        const AUTH0_URL = 'https://example.auth0.com/oauth/token';
        const AUTH0_BODY = {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            // Add the domain to your backend API here. If the frontend calls
            // api.example.com, use api.example.com here 
            audience: 'https://api.example.com/',
            grant_type: 'client_credentials',
            orgId
        };

        const response = await axios.post(
            AUTH0_URL,
            JSON.stringify(AUTH0_BODY),
            {
                headers: {
                    'Content-Type': 'application/json',

                    // Adding this header to fix an error
                    // Error: unexpected end of file
                    // https://stackoverflow.com/questions/74713476/getting-unexpected-end-of-file-axios-error-while-making-a-get-request-in-this
                    // https://github.com/axios/axios/issues/5346
                    "Accept-Encoding": "gzip,deflate,compress"
                },
            },
        );

        if (response.status !== 200) {
            const message = `Error getting JWT from Auth0. Expected response.status = 200, got ${response.status}. orgId: ${orgId}`;
            this.logger.error(({
                message,
                status: response.status,
                orgId,
                response: response.data
            }));
            throw new Error(message);
        } else {
            // console.log('response from auth0: ', response.data);
        }

        return response.data.access_token;
    }

    async queryFlomatika(endpoint: string, queryParams: string, jwt: string): Promise<any> {

        // Add your API here
        const baseUrl = `https://api.example.com`;//TODO: support local api

        if (endpoint.startsWith('/')) {
            endpoint = endpoint.substring(1);
        }

        if (queryParams.startsWith('?')) {
            queryParams = queryParams.substring(1);
        }

        // Temporary fix - till we fix the data in the database
        queryParams = queryParams.replace('board', 'past');

        const URL = `${baseUrl}/${endpoint}?${queryParams}`;
        try {
            const response = await axios.get(URL, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${jwt}`
                }
            });

            if (response.status !== 200) {
                throw new Error(`Flomatila API returned non 200 response. Expected 200. Received ${response.status}`);
            }

            return response.data;
        } catch (e) {
            this.logger.error(({
                message: 'Request to API failed',
                errorMessage: (e as Error).message,
                url: URL.toString(),
                response: (e as any).response.data,
            }));
            return this.ERROR;
        }
    }
}