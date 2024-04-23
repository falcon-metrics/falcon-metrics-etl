import { DateTime } from 'luxon';

export enum ThresholdUnit {
    Day = 'day',
    Week = 'week',
    Month = 'month',
    Percent = 'percent',
}
export enum ThresholdDirection {
    Up = 'up',
    Down = 'down',
    Both = 'both',
}
export const ThresholdDirectionDisplay = {
    up: 'Earlier than',
    down: 'Later than',
    both: 'Earlier / Later than',
};

export interface ThresholdNotificationSubscriptionRequest {
    notificationId: string;
    threshold: number;
    thresholdUnit: ThresholdUnit;
    thresholdDirection: ThresholdDirection;
    queryParameters?: string;
    obeyaRoomId: string;
    targetDate: string;
}

export type ThresholdNotificationSubscription = Omit<
    ThresholdNotificationSubscriptionRequest,
    'targetDate'
> & {
    orgId: string;
    email: string;
    userId: string;
    targetDate?: Date | string;
    active: boolean;
};

export type ThresholdSubscriptionMessage = {
    orgId: string;
    obeyaRoomId: string;
    queryParameter?: string;
    emailTemplateName: string;
};
export type GroupedThresholdSubscriptionMessage = {
    [key: string]: ThresholdSubscriptionMessage;
};

export type DeliveryDateAnalysisItem = {
    '50Percentile'?: DateTime;
    '85Percentile'?: DateTime;
    '98Percentile'?: DateTime;
    desiredDeliveryDate: DateTime;
    desiredDeliveryDateConfidenceLevelPercentage: number;
};
export type ThroughputAnalysisItem = {
    '50Percentile': number;
    '85Percentile': number;
    '98Percentile': number;
    obeyaRemainingItem: number;
    obeyaRemainingItemConfidenceLevelPercentage: number;
};
export type DeliveryDateAnalysisResponse = {
    '50Percentile': string;
    '85Percentile': string;
    '98Percentile': string;
    desiredDeliveryDate: string;
    desiredDeliveryDateConfidenceLevelPercentage: number;
};
export type ThroughputAnalysisResponse = ThroughputAnalysisItem;

export type PredictiveAnalysisResponse = {
    deliveryDateAnalysis: DeliveryDateAnalysisResponse;
    throughputAnalysis: ThroughputAnalysisResponse;
    message?: string;
    isEmpty?: boolean;
    assumptions: Assumptions;
};
export type Assumptions = {
    teamPerformance: string;
    workItemLevel: string;
    workExpansion: string;
    fullFocus: string;
};
export type User = {
    firstName: string;
    lastName: string;
    email: string;
    userId: string;
};

export type ObeyaRoom = {
    orgId?: string;
    filterId?: string;
    roomId?: string;
    roomName?: string;
    beginDate?: Date;
    endDate?: Date;
    datasourceId?: string;
    parsedQuery?: string;
    flomatikaQuery?: string;
    purpose?: string;
    type?: string;
    includeRelated: boolean;
    includeChildren: boolean;
    includeChildrenOfChildren: boolean;
    includeChildrenOfRelated: boolean;
};
