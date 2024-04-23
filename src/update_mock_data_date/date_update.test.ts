/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    updateFlowEfficiency,
    updateWip,
    updateMockData,
    updateLeadTime,
    updateThroughput,
    updateSummaryWidgetWeeks,
    updateSummaryWidgetMonths,
    updateSummaryWidgetQuarters,
} from './date_update_utils';
import { DateTime } from 'luxon';
import {
    LeadTimeResponse,
    SummaryWidget,
    ThroughputResponse,
    WIPResponse,
} from './responses_types';
const getDateFromISO = (date: string) => {
    return DateTime.fromISO(date, { zone: 'utc' });
};
describe('test update date utils', () => {
    test('test update flow efficiency', () => {
        const testData = {
            inOutFlowData: {
                weeklyCumulativeFlow: {
                    inflowItems: [
                        {
                            weekStartingOn: '2021-05-10T00:00:00.000Z',
                            count: 59,
                        },
                        {
                            weekStartingOn: '2021-05-17T00:00:00.000Z',
                            count: 60,
                        },
                    ],
                    outflowItems: [
                        {
                            weekStartingOn: '2021-05-10T00:00:00.000Z',
                            count: 59,
                        },
                        {
                            weekStartingOn: '2021-05-17T00:00:00.000Z',
                            count: 60,
                        },
                    ],
                },
                weeklyFlow: {
                    inflowItems: [
                        {
                            weekStartingOn: '2021-05-10T00:00:00.000Z',
                            count: 59,
                        },
                        {
                            weekStartingOn: '2021-05-17T00:00:00.000Z',
                            count: 60,
                        },
                    ],
                    outflowItems: [
                        {
                            weekStartingOn: '2021-05-10T00:00:00.000Z',
                            count: 59,
                        },
                        {
                            weekStartingOn: '2021-05-17T00:00:00.000Z',
                            count: 60,
                        },
                    ],
                },
            },
        };
        const updated = updateFlowEfficiency(testData);
        const currentWeekStr = DateTime.utc().startOf('week').toISO();
        expect(
            updated.inOutFlowData!.weeklyCumulativeFlow.inflowItems[1]
                .weekStartingOn,
        ).toEqual(currentWeekStr);
        expect(
            updated.inOutFlowData!.weeklyCumulativeFlow.outflowItems[1]
                .weekStartingOn,
        ).toEqual(currentWeekStr);
        expect(
            updated.inOutFlowData!.weeklyFlow.inflowItems[1].weekStartingOn,
        ).toEqual(currentWeekStr);
        expect(
            updated.inOutFlowData!.weeklyFlow.outflowItems[1].weekStartingOn,
        ).toEqual(currentWeekStr);
    });
    test('test update wip dates', () => {
        const testData: WIPResponse = {
            WIPData: {
                count: 21,
                fromDate: '2020-10-12T00:00:00.000Z',
                untilDate: '2021-05-23T00:00:00.000Z',
                numDays: 223,
            },
            scatterplot: [
                {
                    wipAgeInWholeDays: 225,
                    workItemId: '669171',
                    title: 'API integration',
                    state: 'In Progress',
                    workItemType: 'Squad Backlog Item',
                    arrivalDateNoTime: '2020-10-13',
                    commitmentDateNoTime: '2020-10-13',
                },
            ],
            WIPRunChartData: [
                ['2021-05-15', 20],
                ['2021-05-16', 20],
                ['2021-05-17', 21],
            ],
            trendAnalysis: {},
            extensions: {},
        };
        const currDate = DateTime.utc().startOf('day');
        const newFromDate = getDateFromISO(testData.WIPData!.fromDate).plus({
            days: currDate.diff(getDateFromISO(testData.WIPData!.untilDate))
                .days,
        });
        const oldScatterPlotCommitmentDate = DateTime.fromISO(
            testData.scatterplot![0].commitmentDateNoTime!,
        );
        const oldScatterPlotArrivalDate = DateTime.fromISO(
            testData.scatterplot![0].arrivalDateNoTime!,
        );
        const newScatterPlotDate = (date: DateTime) => {
            return date.plus({ days: 1 }).toISODate();
        };

        const updated = updateWip(testData);

        expect(
            getDateFromISO(updated.WIPData!.fromDate).diff(newFromDate!).days,
        ).toEqual(0);
        expect(updated.WIPData?.untilDate).toEqual(currDate.toISODate());
        const runChartWeekNum = DateTime.fromISO(
            updated.WIPRunChartData![2][0],
        ).weekNumber;
        expect(runChartWeekNum).toEqual(currDate.weekNumber);
        expect(updated.scatterplot![0].commitmentDateNoTime).toEqual(
            newScatterPlotDate(oldScatterPlotCommitmentDate),
        );
        expect(updated.scatterplot![0].arrivalDateNoTime).toEqual(
            newScatterPlotDate(oldScatterPlotArrivalDate),
        );
    });

    test('test update lead time', () => {
        const testData: LeadTimeResponse = {
            scatterplot: [
                {
                    wipAgeInWholeDays: 225,
                    workItemId: '669171',
                    title: 'API integration',
                    state: 'In Progress',
                    workItemType: 'Squad Backlog Item',
                    arrivalDateNoTime: '2020-10-13',
                    commitmentDateNoTime: '2020-10-13',
                    departureDateNoTime: '2020-10-13',
                },
            ],
        };
        const oldDepartureDate = testData.scatterplot![0].departureDateNoTime;
        const updated = updateLeadTime(testData);
        expect(
            getDateFromISO(updated.scatterplot![0].departureDateNoTime!),
        ).toEqual(
            getDateFromISO(oldDepartureDate!).plus({
                days: 1,
            }),
        );
    });

    test('test update throughput with weekEndingOn larger than current date', () => {
        const testData: ThroughputResponse = {
            throughputData: {
                count: 101,
                fromDate: '2021-02-22T00:00:00.000Z',
                untilDate: '2021-05-17T00:00:00.000Z',
                numDays: 84,
            },
            throughputRunChartData: {
                throughputSeries: [
                    {
                        weekEndingOn: '2021-08-01T23:59:59.999Z',
                        workItems: [{ id: '724016' }],
                    },
                ],
            },
        };
        const currDate = DateTime.utc().startOf('day');
        const updated = updateThroughput(testData);
        expect(updated.throughputData!.untilDate).toEqual(currDate.toISODate());
        expect(
            updated.throughputRunChartData!.throughputSeries[0].weekEndingOn,
        ).toEqual(currDate.endOf('week').toISODate());
    });
});

describe('test update summary date', () => {
    test('test update week', () => {
        const testData = {
            weeks: [
                {
                    year: 2020,
                    week: 30,
                    values: [
                        {
                            itemTypeName: 'Defect & Incident',
                            percentile85thLeadTime: 5,
                            weekStarting: '2020-07-20T00:00:00.000-03:00',
                        },
                    ],
                },
                {
                    year: 2020,
                    week: 31,
                    values: [
                        {
                            itemTypeName: 'Defect & Incident',
                            percentile85thLeadTime: 5,
                            weekStarting: '2020-07-27T00:00:00.000-03:00',
                        },
                    ],
                },
            ],
        };
        const updatedData = updateSummaryWidgetWeeks(testData.weeks);
        const currentYear = DateTime.utc().year;
        const currentWeekNumber = DateTime.utc().weekNumber;
        // expect(updatedData[0].year).toEqual(currentYear);
        // expect(updatedData[1].week).toEqual(currentWeekNumber);
        // expect(updatedData[0].week).toEqual(currentWeekNumber - 1);
    });
    test('test update months', () => {
        const testData: SummaryWidget['months'] = [
            {
                year: 2021,
                month: 3,
                values: [
                    {
                        itemTypeName: 'Failure Demand',
                        count: 20,
                    },
                ],
            },
            {
                year: 2021,
                month: 4,
                values: [
                    {
                        itemTypeName: 'Failure Demand',
                        count: 10,
                    },
                ],
            },
        ];
        const updatedData = updateSummaryWidgetMonths(testData);
        const now = DateTime.utc();

        const currentYear = now.year;
        const currentMonth = now.month;
        expect(updatedData[updatedData.length - 1].year).toEqual(currentYear);
        expect(updatedData[updatedData.length - 1].month).toEqual(currentMonth);
        expect(updatedData[updatedData.length - 2].year).toEqual(currentYear);
        expect(updatedData[updatedData.length - 2].month).toEqual(
            now.minus({ months: 1 }).month,
        );
        // expect(updatedData[0].week).toEqual(currentWeekNumber - 1);
    });
    test('test update quarters', () => {
        const currentYear = DateTime.now().year;
        const currentQuarter = DateTime.utc().quarter;

        const testData: SummaryWidget['quarters'] = [
            {
                year: currentYear - 1,
                quarter: 4,
                values: [
                    {
                        itemTypeName: 'Customer',
                        count: 35,
                    },
                ],
            },
            {
                year: currentYear,
                quarter: 1,
                values: [
                    {
                        itemTypeName: 'Customer',
                        count: 35,
                    },
                ],
            },
        ];
        const updatedData = updateSummaryWidgetQuarters(testData);
        expect(updatedData[1].year).toEqual(currentYear);
        expect(updatedData[1].quarter).toEqual(currentQuarter);
        // expect(updatedData[0].year).toEqual(currentYear);
        // expect(updatedData[0].quarter).toEqual(currentQuarter - 1);
        // expect(updatedData[0].week).toEqual(currentWeekNumber - 1);
    });
});
