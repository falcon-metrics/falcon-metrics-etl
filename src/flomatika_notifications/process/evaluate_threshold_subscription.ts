import { IEvaluateThresholdSubscriptionProcess } from '../../process_interfaces/evaluate_threshold_subscription_process_interface';
import { IAuth0Secret } from '../../secrets/auth0_secret';
import {
    ObeyaRoom,
    PredictiveAnalysisResponse,
    ThresholdDirectionDisplay,
    ThresholdNotificationSubscription,
    ThresholdSubscriptionMessage,
    User,
} from '../types';
import axios from 'axios';
import { INotificationData } from '../data';
import { evaluateThreshold } from './utils';
import { SendMessageResult } from 'aws-sdk/clients/sqs';
import { ISqsClient } from '../../notifications/sqs_client';
import { NotificationEmailServiceQueue } from '../values';
import { ThresholdNotificationEmailInfo } from '../email_service/types';
import { DateTime } from 'luxon';

export class EvaluateThresholdSubscriptions
    implements IEvaluateThresholdSubscriptionProcess {
    private secrets: IAuth0Secret;
    private notificationData: INotificationData;
    private sqsClient: ISqsClient;

    constructor(opt: {
        secrets: IAuth0Secret;
        notificationData: INotificationData;
        sqsClient: ISqsClient;
    }) {
        this.secrets = opt.secrets;
        this.notificationData = opt.notificationData;
        this.sqsClient = opt.sqsClient;
    }
    async process(message: ThresholdSubscriptionMessage) {
        const jwt = (await this.getJWTFromAuth0(message.orgId)) as string;
        // const jwt = process.env.LOCAL_JWT!;
        const predictiveAnalysis = await this.getPredictiveAnalysis(
            jwt,
            message.obeyaRoomId,
            message,
        );
        if (!predictiveAnalysis?.deliveryDateAnalysis['85Percentile']) {
            throw Error('Invalid analysis response');
        }
        const subscriptions = await this.getSubscriptionsForObeya(message);
        await Promise.all(
            subscriptions?.map(async (subscription) => {
                const sendEmail = this.evaluateThreshold(
                    predictiveAnalysis,
                    subscription,
                );
                if (sendEmail) {
                    //Send message to sqs
                    const user = await this.notificationData.getUserInfo(
                        subscription.orgId,
                        subscription.userId,
                    );
                    const obeyaRoom = await this.notificationData.getObeyaRoom(
                        subscription.obeyaRoomId,
                        subscription.orgId,
                    );
                    const emailMessage = this.formatEmailInfo(
                        predictiveAnalysis,
                        subscription,
                        message.emailTemplateName,
                        user,
                        obeyaRoom,
                    );
                    await this.sendToEmailService(emailMessage);
                }
            }),
        );
    }
    async getPredictiveAnalysis(
        jwt: string,
        obeyaRoomId: string,
        message: ThresholdSubscriptionMessage,
    ): Promise<PredictiveAnalysisResponse> {
        return (await this.queryFlomatika(
            'obeya/predictive-analysis',
            message.queryParameter || `obeyaRoomId=${obeyaRoomId}`,
            jwt,
            {},
        )) as PredictiveAnalysisResponse;
    }
    async getSubscriptionsForObeya(
        message: ThresholdSubscriptionMessage,
    ): Promise<ThresholdNotificationSubscription[]> {
        return await this.notificationData.getAllSubscriptionsForObeya(
            message.orgId,
            message.obeyaRoomId,
        );
    }
    evaluateThreshold(
        analysisResponse: PredictiveAnalysisResponse,
        thresholdSubscription: ThresholdNotificationSubscription,
    ): boolean {
        if (!analysisResponse?.deliveryDateAnalysis['85Percentile']) {
            throw Error('Invalid analysis response');
        }
        const current85PercentileDate = DateTime.fromISO(
            analysisResponse.deliveryDateAnalysis['85Percentile'],
        );
        return evaluateThreshold(
            current85PercentileDate,
            thresholdSubscription,
        );
    }
    private formatEmailInfo(
        analysisResponse: PredictiveAnalysisResponse,
        thresholdSubscription: ThresholdNotificationSubscription,
        emailTemplateName: string,
        user: User,
        obeyaRoom: ObeyaRoom,
    ): ThresholdNotificationEmailInfo {
        const formatDateString = (dateString: string) => {
            return DateTime.fromISO(dateString).toLocaleString(
                DateTime.DATE_FULL,
            );
        };
        const assumptions = analysisResponse.assumptions;
        return {
            recipient: {
                name: user.firstName,
                email: thresholdSubscription.email,
            },
            templateName: emailTemplateName,
            parameters: {
                thresholdDate: formatDateString(
                    thresholdSubscription.targetDate as string,
                ),
                firstName: user.firstName,
                obeyaName: obeyaRoom.roomName!,
                thresholdUnit: thresholdSubscription.threshold.toString(),
                thresholdType: `${thresholdSubscription.thresholdUnit}(s)`,
                thresholdDirection:
                    ThresholdDirectionDisplay[
                    thresholdSubscription.thresholdDirection
                    ],
                forecastWhen50Percentile: formatDateString(
                    analysisResponse.deliveryDateAnalysis['50Percentile'],
                ),
                forecastWhen85Percentile: formatDateString(
                    analysisResponse.deliveryDateAnalysis['85Percentile'],
                ),
                forecastWhen98Percentile: formatDateString(
                    analysisResponse.deliveryDateAnalysis['98Percentile'],
                ),
                assumption1: assumptions.fullFocus,
                assumption2: assumptions.teamPerformance,
                assumption3: assumptions.workExpansion,
                assumption4: assumptions.workItemLevel,
            },
        };
    }
    async getJWTFromAuth0(orgId: string): Promise<any> {
        const CLIENT_ID = await this.secrets.getClientId();
        const CLIENT_SECRET = await this.secrets.getClientSecret();

        const AUTH0_URL = 'https://example.auth0.com/oauth/token';
        const AUTH0_BODY = {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            // Add the domain to your backend API here. If the frontend calls
            // api.example.com, use api.example.com here 
            audience: 'https://api.example.com/',
            grant_type: 'client_credentials',
            orgId,
            roles: '["flomatika_powerUser","governance_obeya","user_admin"]',
        };

        const response = await axios.post(
            AUTH0_URL,
            JSON.stringify(AUTH0_BODY),
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.status !== 200) {
            console.error(`Error getting JWT from Auth0 for orgId: ${orgId}`);
            throw new Error(`Error getting JWT from Auth0 for orgId: ${orgId}`);
        }
        return response.data.access_token;
    }

    async queryFlomatika(
        endpoint: string,
        queryParams: string,
        jwt: string,
        defaultValue: any,
    ): Promise<any> {
        const baseUrl = process.env.IS_OFFLINE
            ? 'http://localhost:4000/prod'
            : 'https://api.example.com'; // Add your API here

        if (endpoint.startsWith('/')) {
            endpoint = endpoint.substring(1);
        }

        if (queryParams.startsWith('?')) {
            queryParams = queryParams.substring(1);
        }
        try {
            const response = await axios.get(
                `${baseUrl}/${endpoint}?${queryParams}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${jwt}`,
                    },
                },
            );
            if (response.status !== 200) {
                throw new Error('Flomatila API returned non 200 response');
            }

            return response.data;
        } catch (e) {
            return defaultValue;
        }
    }
    async sendToEmailService(
        emailInfo: ThresholdNotificationEmailInfo,
    ): Promise<SendMessageResult> {
        return await this.sqsClient.sendMessageToQueue(
            NotificationEmailServiceQueue,
            emailInfo,
        );
    }
}
