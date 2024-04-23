import { InsightsView } from '../flomatika_app/data/fl_insights';

export interface IExtractInsightsProcessor {
    getFitness(jwt: string, view: InsightsView): number;
    getLeadTimeTeam85(jwt: string, view: InsightsView): number;
    getWipAgeBwDates(jwt: string, view: InsightsView): number;
    getLeadtimePredictability(jwt: string, view: InsightsView): string;
    getWipCount(jwt: string, view: InsightsView): number;
    getFlowEfficiency(jwt: string, view: InsightsView): number;

    getValueDemand(jwt: string, view: InsightsView): number;
    getDemand(jwt: string, view: InsightsView): number;
    getCapacity(jwt: string, view: InsightsView): number;
    getInFlow(jwt: string, view: InsightsView): number;
    getOutFlow(jwt: string, view: InsightsView): number;

    getCurrentProductivity(jwt: string, view: InsightsView): number;

    getStaleWork(jwt: string, view: InsightsView): number;
    getBlockers(jwt: string, view: InsightsView): number;
    getFlowDebt(jwt: string, view: InsightsView): number;
    getDiscardedAfterStart(jwt: string, view: InsightsView): number;
    getAverageThroughput(jwt: string, view: InsightsView): number;
    getDelayedItemsCount(jwt: string, view: InsightsView): number;

    getExpeditePcnt(jwt: string, view: InsightsView): number;

    getProductivityQuantiles(
        jwt: string,
        view: InsightsView,
    ): Promise<{
        first: number;
        second: number;
        third: number;
        fourth: number;
    }>;

    getClassOfServiceFromApi(jwt: string, view: InsightsView): Promise<any>;
    getSourceOfDelayAndWasteFromApi(
        jwt: string,
        view: InsightsView,
    ): Promise<any>;
    getFitnessCriteriaFromApi(jwt: string, view: InsightsView): Promise<any>;
    getFlowOfDemandsFromApi(jwt: string, view: InsightsView): Promise<any>;
    getLeadTimeFromApi(jwt: string, view: InsightsView): Promise<any>;
    getWipFromApi(jwt: string, view: InsightsView): Promise<any>;

    extractInsights(orgId?: string): Promise<void>;
    extractFromView(view: InsightsView, jwt: string): Promise<void>;
}
