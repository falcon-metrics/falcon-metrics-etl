import { DateTime } from 'luxon';
import { StateCategory } from '../data/state_category';
import {
    checkIfNowPastDueDate,
    stateCategoryByDate,
    stateCategoryRelativeToDate,
} from './date_utils';

describe(`${checkIfNowPastDueDate.name} tests`, () => {
    test('When base date undefined Then return true', () => {
        expect(checkIfNowPastDueDate(undefined, 5)).toBe(true);
    });

    const now = new Date();

    test('When period undefined Then return true', () => {
        expect(checkIfNowPastDueDate(now, undefined)).toBe(true);
    });

    const past = DateTime.utc().minus({ days: 1 }).toJSDate();

    test('When calculated due date in the past Then return true', () => {
        expect(checkIfNowPastDueDate(past, 10)).toBe(true);
    });

    const future = DateTime.utc().plus({ days: 1 }).toJSDate();

    test('When calculated due date in the future Then return false', () => {
        expect(checkIfNowPastDueDate(future, 20)).toBe(false);
    });
});

describe('stateCategoryByDate Tests', () => {
    test('missing arrival date should be preceding', async () => {
        expect(stateCategoryByDate()).toEqual(
            StateCategory[StateCategory.PRECEDING].toLowerCase(),
        );
    });
});
describe('stateCategoryRelativeToDate tests', () => {
    test('missing arrival date should be preceding', async () => {
        expect(stateCategoryRelativeToDate(DateTime.utc())).toEqual(
            StateCategory[StateCategory.PRECEDING].toLowerCase(),
        );
    });
    test('if changeDate is < arrivalDate and missing commitment date then stateCategory = preceding', async () => {
        const changedDate = DateTime.utc();
        const arrivalDate = DateTime.utc().plus({ days: 1 });
        expect(stateCategoryRelativeToDate(changedDate, arrivalDate)).toEqual(
            StateCategory[StateCategory.PRECEDING].toLowerCase(),
        );
    });
    test('if changeDate is > arrivalDate and missing commitment date then stateCategory = proposed', async () => {
        const changedDate = DateTime.utc();
        const arrivalDate = DateTime.utc().minus({ days: 1 });
        expect(stateCategoryRelativeToDate(changedDate, arrivalDate)).toEqual(
            StateCategory[StateCategory.PROPOSED].toLowerCase(),
        );
    });
    test('if changeDate is < flomatikaCommitmentDate and > arrivalDate then stateCategory = Proposed', async () => {
        const changedDate = DateTime.utc();
        const arrivalDate = DateTime.utc().minus({ days: 1 });
        const commitmentDate = changedDate.plus({ days: 1 });

        expect(
            stateCategoryRelativeToDate(
                changedDate,
                arrivalDate,
                commitmentDate,
            ),
        ).toEqual(StateCategory[StateCategory.PROPOSED].toLowerCase());
    });

    test('if changeDate is >= flomatikaCommitmentDate and < flomatikaDepartureDate then stateCategory = inProgress', async () => {
        const arrivalDate = DateTime.utc();
        const changedDate = DateTime.utc().plus({ days: 1 });
        const commitmentDate = DateTime.utc();
        const departureDate = changedDate.plus({ days: 1 });

        expect(
            stateCategoryRelativeToDate(
                changedDate,
                arrivalDate,
                commitmentDate,
                departureDate,
            ),
        ).toEqual(StateCategory[StateCategory.INPROGRESS].toLowerCase());
    });

    test('if changeDate is >= flomatikaDepartureDate then stateCategory = completed', async () => {
        const arrivalDate = DateTime.utc();
        const commitmentDate = DateTime.utc();
        const departureDate = DateTime.utc();
        const changedDate = departureDate.plus({ days: 1 });

        expect(
            stateCategoryRelativeToDate(
                changedDate,
                arrivalDate,
                commitmentDate,
                departureDate,
            ),
        ).toEqual(StateCategory[StateCategory.COMPLETED].toLowerCase());
    });

    test('comparison: 2021-08-31T23:59:59.999Z. arrival: 2021-04-06T00:40:32.454Z, commitment: 2021-07-26T22:17:21.126Z, departure: 2021-08-25T23:18:40.889Z should be completed', async () => {
        const arrivalDate = DateTime.fromISO('2021-04-06T00:40:32.454Z');
        const commitmentDate = DateTime.fromISO('2021-07-26T22:17:21.126Z');
        const departureDate = DateTime.fromISO('2021-08-25T23:18:40.889Z');

        const changedDate = DateTime.fromISO('2021-08-31T23:59:59.999Z');

        expect(
            stateCategoryRelativeToDate(
                changedDate,
                arrivalDate,
                commitmentDate,
                departureDate,
            ),
        ).toEqual(StateCategory[StateCategory.COMPLETED].toLowerCase());
    });

    test('comparison: 2021-08-31T23:59:59.999Z. arrival: 2021-04-06T00:40:32.454Z, commitment: 2021-07-26T22:17:21.126Z, departure: 2021-08-25T23:18:40.889Z should be completed', async () => {
        const arrivalDate = DateTime.fromISO('2021-04-06T10:40:32.454+10:00');
        const commitmentDate = DateTime.fromISO(
            '2021-07-27T08:17:21.126+10:00',
        );
        const departureDate = DateTime.fromISO('2021-08-26T09:18:40.889+10:00');
        const changedDate = DateTime.fromISO('2021-08-25T23:59:59.999Z');

        expect(
            stateCategoryRelativeToDate(
                changedDate,
                arrivalDate,
                commitmentDate,
                departureDate,
            ),
        ).toEqual(StateCategory[StateCategory.COMPLETED].toLowerCase());
    });
});

//add state category tests;
// https://example.atlassian.net/wiki/spaces/ENG/pages/2308014081/Event+date+and+state+category+rules#Determine-State-category
