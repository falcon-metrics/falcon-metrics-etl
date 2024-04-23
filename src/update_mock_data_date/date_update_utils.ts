/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { FlowEfficiencyResponse, SummaryWidget } from './responses_types';
import { InventoryResponse } from './responses_types';
import { LeadTimeResponse } from './responses_types';
import { SummaryResponse } from './responses_types';
import { ThroughputResponse } from './responses_types';
import { WIPResponse } from './responses_types';
import { DateTime } from 'luxon';
const getDateFromISO = (date: string) => {
    return DateTime.fromISO(date, { zone: 'utc' });
};
const addDaysFromISO = (ISODate: string, days = 1) => {
    return DateTime.fromISO(ISODate, { zone: 'utc' })
        .toUTC()
        .plus({ days: days })
        .toISODate()!;
};
const addWeeksFromISO = (ISODate: string, weeks = 1) => {
    return DateTime.fromISO(ISODate, { zone: 'utc' })
        .toUTC()
        .plus({ weeks: weeks })
        .toISO();
};

type MockResponses = {
    FlowEfficiencyData: any;
    InventoryData: any;
    LeadTimeData: any;
    ThroughputData: any;
    WipData: any;
    SummaryData: any;
};

export const updateFlowEfficiency = (data: FlowEfficiencyResponse) => {
    const itemsToBeUpdate = [
        data.inOutFlowData?.weeklyCumulativeFlow.inflowItems,
        data.inOutFlowData?.weeklyCumulativeFlow.outflowItems,
        data.inOutFlowData?.weeklyFlow.inflowItems,
        data.inOutFlowData?.weeklyFlow.outflowItems,
    ];

    itemsToBeUpdate.forEach((items: any) => {
        //check if the last week is the current week
        const latestWeek = DateTime.fromISO(
            items![items!.length - 1].weekStartingOn,
        ).toUTC();

        const thisWeek = DateTime.utc();

        if (
            !(
                latestWeek.hasSame(thisWeek, 'year') &&
                latestWeek.hasSame(thisWeek, 'week')
            )
        ) {
            items?.map((weeklyCount: any) => {
                weeklyCount.weekStartingOn = thisWeek
                    .startOf('week')
                    .toUTC()
                    .toISO();
                return weeklyCount;
            });
        }
    });
    return data;
};
export const updateWip = (data: WIPResponse) => {
    ////for WIPData
    //update from date and end date
    const currDate = DateTime.utc().startOf('day');

    const dateRange = data.WIPData;
    const dayDiff = currDate.diff(
        getDateFromISO(dateRange!.untilDate).toUTC().startOf('day'),
        ['days'],
    );

    if (dayDiff.days > 0) {
        //236
        dateRange!.fromDate = addDaysFromISO(dateRange!.fromDate, dayDiff.days);
        dateRange!.untilDate = addDaysFromISO(
            dateRange!.untilDate,
            dayDiff.days,
        );
    }

    ////for RunChart
    //check if the last item's week number is the current week
    //if not, add one week to every item
    const runChart = data.WIPRunChartData;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const latestWeek = DateTime.fromISO(runChart![runChart!.length - 1][0]);

    if (
        !(
            latestWeek.hasSame(currDate, 'year') &&
            latestWeek.hasSame(currDate, 'week')
        )
    ) {
        runChart!.forEach((item, index: number) => {
            item[0] = currDate.startOf('week').plus({ days: index });
            return item;
        });
    }

    const scatterPlot = data.scatterplot;
    scatterPlot?.map((item: any) => {
        //update arrival date, and commitment date
        item.arrivalDateNoTime = addDaysFromISO(item.arrivalDateNoTime);
        item.commitmentDateNoTime = addDaysFromISO(item.commitmentDateNoTime!);
        return item;
    });
    return data;
};

export const updateLeadTime = (data: LeadTimeResponse) => {
    ////scatter plot: add one day to each item's commitment and arrival date every date
    const scatterPlot = data.scatterplot;
    scatterPlot?.map((item) => {
        //update arrival date, and commitment date
        item.arrivalDateNoTime = addDaysFromISO(item.arrivalDateNoTime);
        item.commitmentDateNoTime = addDaysFromISO(item.commitmentDateNoTime!);
        item.departureDateNoTime = addDaysFromISO(item.departureDateNoTime!);
        return item;
    });
    return data;
};
export const updateThroughput = (data: ThroughputResponse) => {
    //check if the last week is the current week
    // if not, add one week to every weekEndingOn
    const currDate = DateTime.utc().startOf('day');
    const dateRange = data.throughputData;
    const dayDiff = currDate.diff(
        getDateFromISO(dateRange!.untilDate).toUTC().startOf('day'),
        'days',
    );
    if (dayDiff.days > 0) {
        dateRange!.fromDate = addDaysFromISO(dateRange!.fromDate, dayDiff.days);
        dateRange!.untilDate = addDaysFromISO(
            dateRange!.untilDate,
            dayDiff.days,
        );
    }
    const series = data.throughputRunChartData?.throughputSeries;
    const seriesWeekDiff = currDate.endOf('week').diff(
        getDateFromISO(series![series!.length - 1].weekEndingOn)
            .toUTC()
            .endOf('week'),
        'weeks',
    );
    series?.map((item) => {
        const newDate = getDateFromISO(item.weekEndingOn)
            .plus({
                weeks: seriesWeekDiff.weeks, //should plus the week difference
            })
            .toISODate()!;
        item.weekEndingOn = newDate;
        return item;
    });
    return data;
};

export const updateInventory = (data: InventoryResponse) => {
    const currDate = DateTime.utc().startOf('day');
    const dateRange = data.inventoryData;
    const dayDiff = currDate.diff(
        DateTime.fromISO(dateRange!.untilDate, { zone: 'utc' })
            .toUTC()
            .startOf('day'),
        'days',
    );
    if (dayDiff.days > 0) {
        dateRange!.fromDate = addDaysFromISO(dateRange!.fromDate, dayDiff.days);
        dateRange!.untilDate = addDaysFromISO(
            dateRange!.untilDate,
            dayDiff.days,
        );
    }
    //update scatter plot
    const scatterPlot = data.scatterplot;
    scatterPlot?.map((item) => {
        //update arrival date, and commitment date
        item.arrivalDateNoTime = addDaysFromISO(item.arrivalDateNoTime);
        return item;
    });
    return data;
};

export const updateSummaryWidgetWeeks = (
    widgetWeeksData: SummaryWidget['weeks'],
): SummaryWidget['weeks'] => {
    //update weeks
    //calculate the difference between week starting on
    // add the difference, convert back to ISO
    //update the week number
    const currentWeekStartingOn = DateTime.utc().startOf('week');
    const latestStartingOn =
        widgetWeeksData![widgetWeeksData!.length - 1]!.values![0].weekStarting;
    const weekDiff = currentWeekStartingOn.diff(
        getDateFromISO(latestStartingOn!).startOf('week'),
        'weeks',
    );
    widgetWeeksData.forEach((weekItem) => {
        let newWeekNum: number;
        let newYearNum: number;
        weekItem.values?.map((valueItem, index) => {
            const newWeekStartingAt = getDateFromISO(
                valueItem.weekStarting!,
            ).plus(weekDiff);
            newWeekNum = newWeekStartingAt.weekNumber;
            newYearNum = newWeekStartingAt.year;
            valueItem.weekStarting = newWeekStartingAt
                .startOf('week')
                .toISODate()!;
            if (index === weekItem.values!.length - 1) {
                //so we dont repeat this multiple times
                newWeekNum = newWeekStartingAt.weekNumber;
                newYearNum = newWeekStartingAt.year;
                weekItem.week = newWeekNum;
                weekItem.year = newYearNum;
            }
        });
    });
    return widgetWeeksData;
};
export const updateSummaryWidgetMonths = (
    widgetMonthsData: SummaryWidget['months'],
): SummaryWidget['months'] => {
    const now = DateTime.utc();

    widgetMonthsData.forEach((monthItem, index: number) => {
        monthItem.month = now.minus({
            months: widgetMonthsData.length - 1 - index,
        }).month;
        monthItem.year = now.year;

        return monthItem;
    });
    return widgetMonthsData;
};

export const updateSummaryWidgetQuarters = (
    widgetQuartersData: SummaryWidget['quarters'],
): SummaryWidget['quarters'] => {
    ///get the current quarter
    ///check year difference then *4
    /// add quarter difference
    const lastIndex = widgetQuartersData.length - 1;
    if (typeof widgetQuartersData[lastIndex].year === 'string') {
        widgetQuartersData.forEach((dataItem) => {
            dataItem.year = parseInt(dataItem.year);
            return dataItem;
        });
    }
    if (typeof widgetQuartersData[lastIndex].quarter === 'string') {
        widgetQuartersData.forEach((dataItem) => {
            dataItem.quarter = parseInt(dataItem.quarter);
            return dataItem;
        });
    }
    const yearDiff = DateTime.utc().year - widgetQuartersData[lastIndex].year;
    const quarterDiff =
        DateTime.utc().quarter -
        widgetQuartersData[lastIndex].quarter +
        yearDiff * 4;
    widgetQuartersData.forEach((quarterItem) => {
        const newQuarter = quarterItem.quarter + quarterDiff;
        if (newQuarter > 4) {
            const yearDiff = Math.floor(newQuarter / 4);
            quarterItem.year += yearDiff;
            quarterItem.quarter = Math.floor(newQuarter - 4 * yearDiff);
        } else {
            quarterItem.quarter = newQuarter;
        }
        return quarterDiff;
    });
    return widgetQuartersData;
};

export const updateSummaryWidgetYear = (
    widgetYearsData: SummaryWidget['years'],
): SummaryWidget['years'] => {
    const yearDiff =
        DateTime.utc().year - widgetYearsData[widgetYearsData.length - 1].year;
    widgetYearsData[widgetYearsData.length - 1].year += yearDiff;
    return widgetYearsData;
};

export const updateSummaryWidgetDate = (widgetData: SummaryWidget) => {
    widgetData.years = updateSummaryWidgetYear(widgetData.years);
    widgetData.months = updateSummaryWidgetMonths(widgetData.months);
    widgetData.quarters = updateSummaryWidgetQuarters(widgetData.quarters);
    widgetData.weeks = updateSummaryWidgetWeeks(widgetData.weeks);
    return widgetData;
};

export const updateSummaryData = (summaryData: SummaryResponse) => {
    summaryData.leadTimeWidget = updateSummaryWidgetDate(
        summaryData.leadTimeWidget,
    );
    summaryData.quality = updateSummaryWidgetDate(summaryData.quality);
    summaryData.workflowTrendWidget = updateSummaryWidgetDate(
        summaryData.workflowTrendWidget,
    );
    summaryData.productivity = updateSummaryWidgetDate(
        summaryData.productivity,
    );
    if (summaryData.valueArea)
        summaryData.valueArea = updateSummaryWidgetDate(summaryData.valueArea);
    return summaryData;
};

export const updateMockSummaryData = (
    mockData: MockResponses,
): MockResponses => {
    mockData.SummaryData = updateSummaryData(mockData.SummaryData);
    return mockData;
};

export const updateMockData = (mockData: MockResponses): MockResponses => {
    mockData.FlowEfficiencyData = updateFlowEfficiency(
        mockData.FlowEfficiencyData,
    );
    mockData.LeadTimeData = updateLeadTime(mockData.LeadTimeData);
    mockData.InventoryData = updateInventory(mockData.InventoryData);
    mockData.ThroughputData = updateThroughput(mockData.ThroughputData);
    mockData.WipData = updateWip(mockData.WipData);
    mockData.SummaryData = updateSummaryData(mockData.SummaryData);
    return mockData;
};
