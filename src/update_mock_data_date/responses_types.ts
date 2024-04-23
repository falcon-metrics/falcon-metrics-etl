import { DateTime } from 'luxon';

export type ExtensionData = {
    classOfService?: boolean;
    demandAnalysis?: boolean;
    valueArea?: boolean;
    assignee?: boolean;
    plannedVsUnplanned?: boolean;
};

export type StateCumulativeFlowData = {
    stateName: string;
    cumulativeFlowData: Array<{ sampleDate: Date; numberOfItems: number }>;
};

type weeklyCount = { weekStartingOn: string; count: number };

export type TrendAnalysis = {
    lastWeek?: {
        percentage: number;
        text: string;
        arrowDirection: string;
        arrowColour: string;
    };
    lastTwoWeeks?: {
        percentage: number;
        text: string;
        arrowDirection: string;
        arrowColour: string;
    };
    lastFourWeeks?: {
        percentage: number;
        text: string;
        arrowDirection: string;
        arrowColour: string;
    };
};
export type InOutFlowData = {
    weeklyCumulativeFlow: {
        inflowItems: Array<weeklyCount>;
        outflowItems: Array<weeklyCount>;
    };

    weeklyFlow: {
        inflowItems: Array<weeklyCount>;
        outflowItems: Array<weeklyCount>;
    };
};

export type EfficiencyAnalysisData = {
    valueAddingTimeDays: number;
    waitingTimeDays: number;
};

export type FlowEfficiencyResponse = {
    cumulativeFlowData?: Array<StateCumulativeFlowData>;
    inOutFlowData?: InOutFlowData;
    efficiencyAnalysisData?: EfficiencyAnalysisData;
    timeInStateData?: Array<{ state: string; totalDays: number }>;
};

export type InventoryData = {
    count: number;
    fromDate: string;
    untilDate: string;
    numDays: number;
};

export type Distribution = {
    minimum?: number;
    maximum?: number;
    percentile50th?: number;
    percentile85th?: number;
    percentile95th?: number;
};

export type ScatterplotDatum = {
    workItemId: string;
    title: string;
    workItemType: string;
    arrivalDateNoTime: string;
    commitmentDateNoTime?: string;
    departureDateNoTime?: string;
    inventoryAgeInWholeDays?: number;
    wipAgeInWholeDays?: number;
    state?: string;
};

export type IBoxPlot = {
    median?: number;
    quartile1st?: number;
    quartile3rd?: number;
    interQuartileRange?: number;
    lowerWhisker?: number;
    upperWhisker?: number;
    lowerOutliers?: Array<number>;
    upperOutliers?: Array<number>;
};

export interface InventoryResponse {
    inventoryData?: InventoryData;
    trendAnalysis: TrendAnalysis;
    distribution?: Distribution;
    histogram?: Array<Array<number>>;
    scatterplot?: Array<ScatterplotDatum>;

    workItemTypeAnalysisData?: Array<{ type: string; count: number }>;
    classOfServiceAnalysisData?: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData?: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData?: Array<{ type: string; count: number }>;
    valueAreaAnalysisData?: Array<{ areaName: string; count: number }>;
    assignedToAnalysisData?: Array<any>;
    stateAnalysisData?: Array<{ stateName: string; count: number }>;
    boxPlot?: IBoxPlot;
    distributionShape?: string;
    extensions: ExtensionData;
}

export type HistogramDatum = {
    leadTimeInDays?: number;
    workItems: Array<{
        id: string;
    }>;
};

export type PredictabilityItem = {
    itemTypeName: string;
    serviceLevelExpectationDays: number;
    serviceLevelPercent: any;
    trendAnalysis: TrendAnalysis;
};

export type LeadTimeResponse = {
    completedItemCount?: number;
    distribution?: Distribution;
    predictability?: Array<PredictabilityItem>;
    histogram?: Array<HistogramDatum>;
    scatterplot?: Array<ScatterplotDatum>;
    boxPlot?: IBoxPlot;
    distributionShape?: string;
};

type BaseDatum = {
    defectIncident: number[];
    feature: number[];
    enhancementOptimisation: number[];
    enablersTechDebt: number[];
    risksCompliance: number[];
    managementActivity: number[];
};

export type SpeedValueDatum = BaseDatum & { scaleX: string[] };

export type DemandTyepDatum = BaseDatum & { scaleX: string[] };

export type WorkFlowTrendValue = { itemTypeName: string; state: string };

export type SummaryPastItem = {
    demandType?: string;
    sle?: string;
    targetMet?: string;
    trendSle?: string;
    leadtime?: string;
    trendLeadtime?: string;
    variabilityLeadtime?: string;
    throughput?: string;
    trendThroughput?: string;
    variabilityThroughput?: string;
};

export type SummaryInprogressItem = {
    itemTypeName: string;
    wipCount: number;
    wipAge85Percentile: number;
    wipAgeAverage: number;
    wipVariability: string;
    flowDebt: string;
    flowEfficiencyAverage: number;
    keySourceOfDelay: string;
    demandVsCapacity: string;
};

export type valueAreaDatum = {
    customer: number[];
    infrastructure: number[];
    architecture: number[];
    business: number[];
    scaleX: string[];
};

export type ProductivityItem = {
    itemTypeName: string;
    count: number;
    weekStarting: string;
};

export type SummaryTableFutureItem = {
    itemTypeName: string;
    inventoryCount: number;
    inventoryAgePercentile85th: string;
    inventoryVariability: string;
    commitmentRate: string;
    timeToCommitPercentile85th: string;
};

export type SummaryResponse = {
    productivity: SummaryWidget;
    workflowTrendWidget: SummaryWidget;
    summaryTable: {
        past: Array<SummaryPastItem>;
        present: Array<SummaryInprogressItem>;
        future: Array<SummaryTableFutureItem>;
        [index: string]: any;
    };
    leadTimeWidget: SummaryWidget;
    demandType?: DemandTyepDatum;
    quality: SummaryWidget;
    valueArea?: SummaryWidget;
};

export type SummaryWidgetValue = {
    itemTypeName: string;
    weekStarting?: string;
    count?: number;
    state?: string;
    percentile85thLeadTime?: number;
};

export type SummaryWidget = {
    years: Array<{
        year: number;
        values?: SummaryWidgetValue[];
    }>;
    quarters: Array<{
        year: any;
        quarter: any;
        values?: SummaryWidgetValue[];
    }>;
    months: Array<{
        year: number;
        month: number;
        values?: SummaryWidgetValue[];
    }>;
    weeks: Array<{
        year: number;
        week: number;
        values?: SummaryWidgetValue[];
    }>;
};

export type ThroughputData = {
    count: number;
    fromDate: string;
    untilDate: string;
    numDays: number;
};

export type ThroughputRunChartData = {
    throughputSeries: Array<{
        weekEndingOn: string;
        workItems: Array<{ id: string }>;
    }>;
};

export type AssignedToDatum = {
    name: string;
    workItems: Array<{ id: string }>;
};

export type ThroughputResponse = {
    throughputData?: ThroughputData;
    throughputRunChartData?: ThroughputRunChartData;
    trendAnalysis?: TrendAnalysis;
    workItemTypeAnalysisData?: Array<{ type: string; count: number }>;
    classOfServiceAnalysisData?: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData?: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData?: Array<{ type: string; count: number }>;
    valueAreaAnalysisData?: Array<{ areaName: string; count: number }>;
    assignedToAnalysisData?: Array<AssignedToDatum>;
    boxPlot?: IBoxPlot;
    distribution?: Distribution;
    extensions?: ExtensionData;
};

export type WIPData = {
    count: number;
    fromDate: string;
    untilDate: string;
    numDays: number;
};

export type WIPRunChartData = {
    WIPSeries: Map<number, number>;
    earliestWorkItemDate: DateTime;
};

export type WIPResponse = {
    WIPData?: WIPData;
    WIPRunChartData?: Array<Array<any>>; // item[0]: number of milliseconds utc, item[1] count
    trendAnalysis: TrendAnalysis;
    distribution?: Distribution;
    histogram?: Array<HistogramDatum>;
    scatterplot?: Array<ScatterplotDatum>;
    assignedToAnalysisData?: Array<AssignedToDatum>;
    workItemTypeAnalysisData?: Array<{ type: string; count: number }>;
    stateAnalysisData?: Array<{ stateName: string; count: number }>;
    classOfServiceAnalysisData?: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData?: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData?: Array<{ type: string; count: number }>;
    valueAreaAnalysisData?: Array<{ areaName: string; count: number }>;
    boxPlot?: IBoxPlot;
    distributionShape?: string;
    extensions: ExtensionData;
};
