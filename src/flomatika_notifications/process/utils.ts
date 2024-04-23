import { DateTime } from 'luxon';
import {
    PredictiveAnalysisResponse,
    ThresholdDirection,
    ThresholdNotificationSubscription,
    ThresholdUnit,
} from '../types';

export const directionCorrect = (
    targetDate: DateTime,
    currentPredicted: DateTime,
    thresholdDirection: ThresholdDirection,
): boolean => {
    let directionCorrect = true;
    switch (thresholdDirection) {
        case ThresholdDirection.Down:
            return (directionCorrect = currentPredicted > targetDate);
        case ThresholdDirection.Up:
            return (directionCorrect = currentPredicted < targetDate);
    }
    return directionCorrect;
};
export const differenceOverThreshold = (
    targetDate: DateTime,
    currentPredicted: DateTime,
    thresholdInfo: { thresholdUnit: ThresholdUnit; threshold: number },
): boolean => {
    let overThreshold = true;
    switch (thresholdInfo.thresholdUnit) {
        case ThresholdUnit.Day:
            overThreshold =
                Math.abs(currentPredicted.diff(targetDate, 'days').days) >
                thresholdInfo.threshold;
            break;
        case ThresholdUnit.Week:
            overThreshold =
                Math.abs(currentPredicted.diff(targetDate, 'weeks').weeks) >
                thresholdInfo.threshold;
            break;
        case ThresholdUnit.Month:
            overThreshold =
                Math.abs(currentPredicted.diff(targetDate, 'months').months) >
                thresholdInfo.threshold;
            break;
    }
    return overThreshold;
};

/**
 * evaluate the subscribed threshold and decide if should notify user
 * @param analysisResponse
 * @param thresholdSubscription
 * @returns shouldNotify: boolean
 */
export const evaluateThreshold = (
    current85Percentile: DateTime,
    thresholdSubscription: ThresholdNotificationSubscription,
): boolean => {
    let shouldNotify = false;
    // const current85Percentile = DateTime.fromISO(
    //     analysisResponse.deliveryDateAnalysis['85Percentile'],
    // );
    if (!thresholdSubscription.targetDate) return shouldNotify;
    const targetDate = DateTime.fromISO(
        thresholdSubscription.targetDate as string,
    );

    shouldNotify =
        directionCorrect(
            targetDate,
            current85Percentile,
            thresholdSubscription.thresholdDirection,
        ) &&
        differenceOverThreshold(
            targetDate,
            current85Percentile,
            thresholdSubscription,
        );
    return shouldNotify;
};
