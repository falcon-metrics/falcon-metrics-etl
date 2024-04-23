import { DateTime } from 'luxon';
import { Workflow } from '../data/work_item_type_aurora';
import { RevisionTypes } from '../jiracloud/process/revision_processor';
import { EventDates, HistoryItem } from './event_date_extractor';

import { EventDateExtractor } from './event_date_extractor';
describe('check sorting works', () => {
    test('ascending sorting works', () => {
        const startDate = DateTime.fromISO('2021-01-01');
        const arrivalDate1 = startDate;
        const commitmentDate1 = startDate.plus({ days: 7 });
        const departureDate = startDate.plus({ days: 8 });
        const arrivalDate2 = startDate.plus({ days: 10 });

        const historyItems: Array<HistoryItem> = [
            {
                statusId: '5',
                changedDate: departureDate,
                statusName: 'test',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                statusId: '1',
                changedDate: arrivalDate1,
                statusName: 'test',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                statusId: '3',
                changedDate: commitmentDate1,
                statusName: 'test',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];

        historyItems.sort(
            (
                a,
                b, //ascending order
            ) => a.changedDate.toMillis() - b.changedDate.toMillis(),
        );

        expect(historyItems[0].statusId).toBe('1');
        expect(historyItems[1].statusId).toBe('3');
    });
});

describe('getEventDatesFromHistory', () => {
    test('test simple sequential arrival, commitment, departure points', async () => {
        const arrivalDate: DateTime = DateTime.now();
        const commitmentDate: DateTime = arrivalDate.plus({ days: 1 });
        const departureDate: DateTime = commitmentDate.plus({ days: 1 });

        const revisions: Array<HistoryItem> = [
            {
                changedDate: arrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];

        const workflow: Workflow = {
            workflowId: 'workflow id 1',
            workflowSteps: [
                {
                    id: 'arrival step',
                    workflowId: 'workflow id 1',
                    name: 'arrival step',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    id: 'commitment step',
                    workflowId: 'workflow id 1',
                    name: 'commitment step',
                    stateCategory: 'inprogress',
                    stateType: 'active',
                    order: 2,
                },
                {
                    id: 'departure step',
                    workflowId: 'workflow id 1',
                    name: 'departure step',
                    stateCategory: 'completed',
                    stateType: 'active',
                    order: 3,
                },
            ],
            datasourceId: 'testDatasourceId',
            orgId: 'orgId',
            workflowEvents: {
                arrivalPointOrder: 1,
                commitmentPointOrder: 2,
                departurePointOrder: 3,
            },
        };

        const expected: EventDates = {
            arrival: arrivalDate,
            arrivalPointOrder: 1,
            commitment: commitmentDate,
            commitmentPointOrder: 2,
            departure: departureDate,
            departurePointOrder: 3,
            isDelayed: false,
            stepCategory: 'proposed',
        };

        const eventDateExtractor = new EventDateExtractor();

        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![0]!,
        );

        expect(actual).toEqual(expected);
    });

    test('should consider same day arrival > commitment > arrival as arrival', async () => {
        const arrivalDate: DateTime = DateTime.now().startOf('day');
        const commitmentDate: DateTime = arrivalDate.plus({ hours: 1 });
        const departureDate: DateTime = commitmentDate.plus({ hours: 1 });
        const arrivalDate_2: DateTime = departureDate.plus({ hours: 1 });

        const revisions: Array<HistoryItem> = [
            {
                changedDate: arrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: arrivalDate_2,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx4',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];

        const workflow: Workflow = {
            workflowId: 'workflow id 1',
            workflowSteps: [
                {
                    workflowId: 'workflow id 1',
                    id: 'arrival step',
                    name: 'arrival step',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    workflowId: 'workflow id 1',
                    id: 'commitment step',
                    name: 'commitment step',
                    stateCategory: 'inprogress',
                    stateType: 'active',
                    order: 2,
                },
                {
                    workflowId: 'workflow id 1',
                    id: 'departure step',
                    name: 'departure step',
                    stateCategory: 'completed',
                    stateType: 'active',
                    order: 3,
                },
            ],
            workflowEvents: {
                arrivalPointOrder: 1,
                commitmentPointOrder: 2,
                departurePointOrder: 3,
            },
            datasourceId: 'testDatasourceId',
            orgId: 'orgId',
        };

        const expected: EventDates = {
            arrival: arrivalDate,
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
            isDelayed: false,
            stepCategory: 'proposed',
        };

        const eventDateExtractor = new EventDateExtractor();

        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![0]!,
        );

        expect(actual).toEqual(expected);
    });
});

const setUpTests = () => {
    const eventDateExtractor = new EventDateExtractor();
    const workflow: Workflow = {
        workflowId: 'workflow id 1',
        workflowSteps: [
            {
                workflowId: 'workflow id 1',
                id: 'preceding step',
                name: 'preceding step',
                stateCategory: 'arrival',
                stateType: 'active',
                order: 0,
            },
            {
                id: 'arrival step',
                workflowId: 'workflow id 1',
                name: 'arrival step',
                stateCategory: 'arrival',
                stateType: 'active',
                order: 1,
            },
            {
                id: 'commitment step',
                workflowId: 'workflow id 1',
                name: 'commitment step',
                stateCategory: 'inprogress',
                stateType: 'active',
                order: 2,
            },
            {
                id: 'departure step',
                workflowId: 'workflow id 1',
                name: 'departure step',
                stateCategory: 'completed',
                stateType: 'active',
                order: 3,
            },
        ],
        datasourceId: 'testDatasourceId',
        orgId: 'orgId',
        workflowEvents: {
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        },
    };
    const initialArrivalDate: DateTime = DateTime.now().startOf('day');

    const initialRevisionsWithArrival: Array<HistoryItem> = [
        {
            changedDate: initialArrivalDate,
            statusId: 'arrival step',
            statusName: 'arrival step',
            revision: 'xxx1',
            workItemId: 'abcd',
            type: RevisionTypes.STATE_CHANGE,
        },
    ];

    return {
        initialRevisionsWithArrival,
        initialArrivalDate,
        workflow,
        eventDateExtractor,
    };
};

describe('Item moving into a Preceding point', () => {
    const {
        eventDateExtractor,
        workflow,
        initialArrivalDate,
        initialRevisionsWithArrival,
    } = setUpTests();
    test('When item has no other workflow dates and moved into preceding', async () => {
        const expected: EventDates = {
            arrival: undefined,
            commitment: undefined,
            departure: undefined,
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'preceding',
        };
        const revision = [
            {
                changedDate: initialArrivalDate,
                statusId: 'preceding step',
                statusName: 'preceding step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![0]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival date then moved into preceding, should remove arrival date', async () => {
        const expected: EventDates = {
            arrival: undefined,
            commitment: undefined,
            departure: undefined,
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'preceding',
        };
        const precedingDate = initialArrivalDate.plus({ days: 2 });
        const revision = initialRevisionsWithArrival.concat({
            changedDate: precedingDate,
            statusId: 'preceding step',
            statusName: 'preceding step',
            revision: 'xxx2',
            workItemId: 'abcd',
            type: RevisionTypes.STATE_CHANGE,
        });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![0]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival date and commitment date then moved into preceding', async () => {
        const commitmentDate = initialArrivalDate.plus({ days: 1 });
        const precedingDate = initialArrivalDate.plus({ days: 2 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            arrivalPointOrder: 1,
            commitment: commitmentDate,
            commitmentPointOrder: 2,
            departure: undefined,
            departurePointOrder: 3,
            isDelayed: true,
            delayedRevision: 'xxx2',
            stepCategory: 'preceding',
        };
        const revision = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: precedingDate,
                statusId: 'preceding step',
                statusName: 'preceding step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![0]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival date, commitment date and departure then moved into preceding', async () => {
        const commitmentDate = initialArrivalDate.plus({ days: 1 });
        const departureDate = initialArrivalDate.plus({ days: 2 });
        const precedingDate = initialArrivalDate.plus({ days: 4 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: commitmentDate,
            departure: undefined, /////We should clear the departure date
            isDelayed: true,
            delayedRevision: 'xxx3',
            stepCategory: 'preceding',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: precedingDate,
                statusId: 'preceding step',
                statusName: 'preceding step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![0]!,
        );
        expect(actual).toEqual(expected);
    });
});
describe('Item moving into a Arrival point', () => {
    const {
        eventDateExtractor,
        workflow,
        initialArrivalDate,
        initialRevisionsWithArrival,
    } = setUpTests();
    test('When item has no other workflow dates, and moved into arrival', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const expected: EventDates = {
            arrival: initialArrivalDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            initialRevisionsWithArrival,
            workflow,
            workflow.workflowSteps![1]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has an arrival date, and moved into arrival point, arrival date should be the first arrival date', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const expected: EventDates = {
            arrival: initialArrivalDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const newArrivalDate = initialArrivalDate.plus({ days: 1 });
        const revisions = initialRevisionsWithArrival.concat({
            changedDate: newArrivalDate,
            statusId: 'arrival step',
            statusName: 'arrival step',
            revision: 'xxx1',
            workItemId: 'abcd',
            type: RevisionTypes.STATE_CHANGE,
        });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![1]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item move into an arrival point, has an commitment date', async () => {
        const commitmentDate = initialArrivalDate.plus({ days: 2 });
        const newArrivalDate = initialArrivalDate.plus({ days: 3 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: commitmentDate,
            isDelayed: true,
            delayedRevision: 'xxx2',
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revisions = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: newArrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![1]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item move into an arrival point, has an commitment date and departure date', async () => {
        //Set stateCategory to Proposed

        // Set isDelayed to True

        // Clear Departure Date
        const commitmentDate = initialArrivalDate.plus({ days: 2 });
        const departureDate = initialArrivalDate.plus({ days: 3 });
        const newArrivalDate = initialArrivalDate.plus({ days: 4 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: commitmentDate,
            departure: undefined,
            isDelayed: true,
            delayedRevision: 'xxx3',
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revisions = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: newArrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![1]!,
        );
        expect(actual).toEqual(expected);
    });

    test('When item is delayed but later moves to the commitment point (the item is not delayed anymore)', async () => {
        const commitmentDate = initialArrivalDate.plus({ days: 2 });
        const newArrivalDate = initialArrivalDate.plus({ days: 3 });
        const laterDate = initialArrivalDate.plus({ days: 20 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            // Commitment date should be the original commitment date
            commitment: commitmentDate,
            isDelayed: false,
            stepCategory: 'inprogress',
            // TODO: What are these?
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revisions = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: newArrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: laterDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![2]!,
        );
        expect(actual).toEqual(expected);
    });

    test('When item is delayed but later moves to the departure point (the item is not delayed anymore)', async () => {
        const commitmentDate = initialArrivalDate.plus({ days: 2 });
        const newArrivalDate = initialArrivalDate.plus({ days: 3 });
        const departureDate = initialArrivalDate.plus({ days: 20 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: commitmentDate,
            departure: departureDate,
            isDelayed: false,
            stepCategory: 'completed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revisions = initialRevisionsWithArrival
            .concat({
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: newArrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![3]!,
        );
        expect(actual).toEqual(expected);
    });
});
describe('Item moving into a Commitment point', () => {
    const {
        eventDateExtractor,
        workflow,
        initialArrivalDate,
        initialRevisionsWithArrival,
    } = setUpTests();
    const commitmentDate = initialArrivalDate;
    test('When item has no other workflow dates, and moved into commitment', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const expected: EventDates = {
            arrival: commitmentDate,
            commitment: commitmentDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'inprogress',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = [
            {
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![2]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival date, and moved into commitment', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const commitmentDate = initialArrivalDate.plus({ days: 1 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: commitmentDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'inprogress',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival.concat({
            changedDate: commitmentDate,
            statusId: 'commitment step',
            statusName: 'commitment step',
            revision: 'xxx1',
            workItemId: 'abcd',
            type: RevisionTypes.STATE_CHANGE,
        });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![2]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival, commitment and departure date, and moved into commitment', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const firstCommitmentDate = initialArrivalDate.plus({ days: 1 });
        const departureDate = initialArrivalDate.plus({ days: 2 });
        const secondCommitmentDate = initialArrivalDate.plus({ days: 3 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: firstCommitmentDate,
            departure: undefined,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'inprogress',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival
            .concat({
                changedDate: firstCommitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: secondCommitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![2]!,
        );
        expect(actual).toEqual(expected);
    });
});
describe('Item moving into a Departure point', () => {
    const {
        eventDateExtractor,
        workflow,
        initialArrivalDate,
        initialRevisionsWithArrival,
    } = setUpTests();
    test('When item has no other workflow dates, and moved into departure', async () => {
        const departureDate = initialArrivalDate;

        const expected: EventDates = {
            arrival: departureDate,
            commitment: departureDate,
            departure: departureDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'completed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = [
            {
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![3]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival date, and moved into departure', async () => {
        const departureDate = initialArrivalDate.plus({ days: 1 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: initialArrivalDate,
            departure: departureDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'completed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival.concat({
            changedDate: departureDate,
            statusId: 'departure step',
            statusName: 'departure step',
            revision: 'xxx1',
            workItemId: 'abcd',
            type: RevisionTypes.STATE_CHANGE,
        });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![3]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival, commitment, and moved into departure', async () => {
        // Set stateCategory to Proposed
        // Set ArrivalDate as the
        const firstCommitmentDate = initialArrivalDate.plus({ days: 1 });
        const departureDate = initialArrivalDate.plus({ days: 2 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: firstCommitmentDate,
            departure: departureDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'completed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival
            .concat({
                changedDate: firstCommitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![3]!,
        );
        expect(actual).toEqual(expected);
    });
    test('When item has arrival, commitment and departure, then moved into departure', async () => {
        const firstCommitmentDate = initialArrivalDate.plus({ days: 1 });
        const firstDepartureDate = initialArrivalDate.plus({ days: 2 });
        const secondDepartureDate = initialArrivalDate.plus({ days: 3 });
        const expected: EventDates = {
            arrival: initialArrivalDate,
            commitment: firstCommitmentDate,
            departure: firstDepartureDate,
            isDelayed: false,
            delayedRevision: undefined,
            stepCategory: 'completed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };
        const revision = initialRevisionsWithArrival
            .concat({
                changedDate: firstCommitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: firstDepartureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            })
            .concat({
                changedDate: secondDepartureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            });
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revision,
            workflow,
            workflow.workflowSteps![3]!,
        );
        expect(actual).toEqual(expected);
    });
});

describe('delayed items tests', () => {
    const eventDateExtractor = new EventDateExtractor();
    test('should be delayed if back to arrival on later date', async () => {
        const arrivalDate: DateTime = DateTime.now().startOf('day');
        const commitmentDate: DateTime = arrivalDate.plus({ hours: 1 });
        const departureDate: DateTime = commitmentDate.plus({ hours: 1 });
        const arrivalDate_2: DateTime = departureDate.plus({ days: 1 });

        const revisions: Array<HistoryItem> = [
            {
                changedDate: arrivalDate,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: commitmentDate,
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: departureDate,
                statusId: 'departure step',
                statusName: 'departure step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: arrivalDate_2,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx4',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];

        const workflow: Workflow = {
            workflowId: 'workflow id 1',
            workflowSteps: [
                {
                    id: 'arrival step',
                    workflowId: 'workflow id 1',
                    name: 'arrival step',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    id: 'commitment step',
                    workflowId: 'workflow id 1',
                    name: 'commitment step',
                    stateCategory: 'inprogress',
                    stateType: 'active',
                    order: 2,
                },
                {
                    id: 'departure step',
                    workflowId: 'workflow id 1',
                    name: 'departure step',
                    stateCategory: 'completed',
                    stateType: 'active',
                    order: 3,
                },
            ],
            datasourceId: 'testDatasourceId',
            orgId: 'orgId',
            workflowEvents: {
                arrivalPointOrder: 1,
                commitmentPointOrder: 2,
                departurePointOrder: 3,
            },
        };

        const expected: EventDates = {
            arrival: arrivalDate,
            commitment: commitmentDate,
            departure: undefined, //skipped when future points exist
            isDelayed: true,
            delayedRevision: 'xxx4',
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: 2,
            departurePointOrder: 3,
        };

        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![0]!,
        );

        expect(actual).toEqual(expected);
    });

    test('example from FLO-1430', async () => {
        const revisions: Array<HistoryItem> = [
            {
                changedDate: DateTime.fromMillis(1632451308699),
                statusId: 'created step',
                statusName: 'created step',
                revision: 'xxx0',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: DateTime.fromMillis(1632451361220),
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: DateTime.fromMillis(1632451383407),
                statusId: 'commitment step',
                statusName: 'commitment step',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: DateTime.fromMillis(1632451440943),
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];

        const workflow: Workflow = {
            workflowId: 'workflow id 1',
            workflowSteps: [
                {
                    workflowId: 'workflow id 1',
                    id: 'created step',
                    name: 'created step',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    id: 'arrival step',
                    workflowId: 'workflow id 1',
                    name: 'arrival step',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    id: 'commitment step',
                    workflowId: 'workflow id 1',
                    name: 'commitment step',
                    stateCategory: 'inprogress',
                    stateType: 'active',
                    order: 3,
                },
                {
                    id: 'departure step',
                    workflowId: 'workflow id 1',
                    name: 'departure step',
                    stateCategory: 'completed',
                    stateType: 'active',
                    order: 4,
                },
            ],
            datasourceId: 'testDatasourceId',
            orgId: 'orgId',
            workflowEvents: {
                arrivalPointOrder: 1,
                commitmentPointOrder: 2,
                departurePointOrder: 3,
            },
        };

        const expected: EventDates = {
            arrival: DateTime.fromMillis(1632451308699),
            commitment: undefined,
            departure: undefined,
            isDelayed: false,
            stepCategory: 'proposed',
            arrivalPointOrder: 1,
            commitmentPointOrder: Infinity,
            departurePointOrder: 3,
        };

        const eventDateExtractor = new EventDateExtractor();

        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![0]!,
        );

        expect(actual).toEqual(expected);
    });

    test('example from BET-151, when item moved back to before arrival', async () => {
        const revisions: Array<HistoryItem> = [
            {
                changedDate: DateTime.fromISO('2021-09-22T11:28:19.769+1000'),
                statusId: '10125', //workflow step id
                statusName: 'Backlog',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: DateTime.fromISO('2021-10-08T11:28:19.769+1000'),
                statusId: '10007', //workflow step id
                statusName: 'Ready for Development',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: DateTime.fromISO('2021-10-10T11:28:19.769+1000'),
                statusId: '10125', //workflow step id
                statusName: 'Backlog',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];
        const eventDateExtractor = new EventDateExtractor();
        const expected: EventDates = {
            arrival: DateTime.fromISO('2021-10-08T11:28:19.769+1000'),
            commitment: DateTime.fromISO('2021-10-08T11:28:19.769+1000'),
            departure: undefined,
            isDelayed: true,
            stepCategory: 'preceding',
            arrivalPointOrder: 1,
            commitmentPointOrder: 3,
            departurePointOrder: 4,
        };
        const workflow: Workflow = {
            workflowId: 'workflow id 1',
            workflowSteps: [
                {
                    id: '10125',
                    workflowId: 'workflow id 1',
                    name: 'Backlog',
                    stateCategory: 'proposed',
                    stateType: 'active',
                    order: 0,
                },
                {
                    id: '11927',
                    workflowId: 'workflow id 1',
                    name: 'Next',
                    stateCategory: 'arrival',
                    stateType: 'active',
                    order: 1,
                },
                {
                    id: '10007',
                    workflowId: 'workflow id 1',
                    name: 'Ready for Development',
                    stateCategory: 'inprogress',
                    stateType: 'active',
                    order: 3,
                },
                {
                    id: '10124',
                    workflowId: 'workflow id 1',
                    name: 'Done',
                    stateCategory: 'completed',
                    stateType: 'active',
                    order: 4,
                },
            ],
            datasourceId: 'testDatasourceId',
            orgId: 'orgId',
            workflowEvents: {
                arrivalPointOrder: 1,
                commitmentPointOrder: 2,
                departurePointOrder: 4,
            },
        };
        const actual = await eventDateExtractor.getEventDatesFromHistory(
            revisions,
            workflow,
            workflow.workflowSteps![0]!,
        );

        expect(actual).toEqual(expected);
    });
});
