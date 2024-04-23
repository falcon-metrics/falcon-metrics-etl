import { SQS } from 'aws-sdk';
import { EmailInfo } from '../flomatika_notifications/email_service/types';
import {
    PredictiveAnalysisResponse,
    ThresholdNotificationSubscription,
    ThresholdSubscriptionMessage,
} from '../flomatika_notifications/types';

export interface IEvaluateThresholdSubscriptionProcess {
    getPredictiveAnalysis(
        jwt: string,
        obeyaRoomId: string,
        message: ThresholdSubscriptionMessage,
    ): Promise<PredictiveAnalysisResponse>;
    evaluateThreshold(
        analysisResponse: PredictiveAnalysisResponse,
        thresholdSubscription: ThresholdNotificationSubscription,
    ): boolean;
    sendToEmailService(emailInfo: EmailInfo): Promise<SQS.SendMessageResult>;
    process(message: ThresholdSubscriptionMessage): Promise<void>;
}
