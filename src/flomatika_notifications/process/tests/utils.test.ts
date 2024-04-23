import { differenceOverThreshold, evaluateThreshold } from '../utils';
import {
    ThresholdDirection,
    ThresholdNotificationSubscription,
    ThresholdUnit,
} from '../../types';
import { DateTime } from 'luxon';

describe('differenceOverThreshold', () => {
    test('threshold unit is month', () => {
        const thresholdInfo = {
            thresholdUnit: ThresholdUnit.Month,
            threshold: 1,
        };
        const targetDate = DateTime.fromISO('2022-02-01');
        let actualDate = DateTime.fromISO('2022-02-05');
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(false);
        actualDate = DateTime.fromISO('2022-03-05');
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(true);
    });
    test('threshold unit is days', () => {
        const thresholdInfo = {
            thresholdUnit: ThresholdUnit.Day,
            threshold: 1,
        };
        const targetDate = DateTime.fromISO('2022-02-01');
        let actualDate = DateTime.fromISO('2022-02-01');
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(false);
        actualDate = DateTime.fromISO('2022-02-05');
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(true);
    });
    test('threshold unit is weeks', () => {
        const thresholdInfo = {
            thresholdUnit: ThresholdUnit.Week,
            threshold: 1,
        };
        const targetDate = DateTime.fromISO('2022-02-01');
        let actualDate = targetDate.plus({ day: 2 });
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(false);
        actualDate = targetDate.plus({ week: 2 });
        expect(
            differenceOverThreshold(targetDate, actualDate, thresholdInfo),
        ).toBe(true);
    });
});
describe('test evaluate subscriptions', () => {
    const exampleSubscription1: ThresholdNotificationSubscription = {
        notificationId: '1',
        active: true,
        threshold: 7,
        thresholdUnit: ThresholdUnit.Day,
        thresholdDirection: ThresholdDirection.Both,
        queryParameters: 'obeyaRoomId=test-obeya-room',
        targetDate: '2022-04-25',
        obeyaRoomId: 'test-obeya-room',
        userId: 'test-user-id',
        email: 'test-email',
        orgId: 'test-org',
    };
    test('expect evaluator to return true', () => {
        const current85PercentileDate = DateTime.fromISO('2022-04-03');
        expect(
            differenceOverThreshold(
                DateTime.fromISO(exampleSubscription1.targetDate as string),
                current85PercentileDate,
                {
                    threshold: exampleSubscription1.threshold,
                    thresholdUnit: exampleSubscription1.thresholdUnit,
                },
            ),
        ).toBe(true);
        expect(
            evaluateThreshold(current85PercentileDate, exampleSubscription1),
        ).toBe(true);
    });
});
