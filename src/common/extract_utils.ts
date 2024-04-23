import { Logger } from 'pino';
import { DateTime } from 'luxon';
import slugify from 'slugify';
import { IDatasource, ServiceDetails } from '../data/datasource_aurora';
import {
    BatchSizeChangeRate,
    BatchSizeDirection,
    BatchSizeLimit,
} from './types_and_constants';
import { SNSEvent, SQSEvent } from 'aws-lambda';

export const sleep = async (logger: Logger, milliseconds: number) => {
    logger.debug(`sleep ${milliseconds} milliseconds`);
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const isTimeToQuit = (
    startTimeMillis: number,
    runDelayInMinutes: number,
): boolean => {
    const runDelayInMillis = runDelayInMinutes * 60000; //60s / 1min =
    const nowInMillis = Date.now();
    const durationInMillis = nowInMillis - startTimeMillis;
    //quit 30s early to give promises time to finish etc
    const margin = 30000;

    if (durationInMillis >= runDelayInMillis - margin) {
        console.log(
            `isTimeToQuit: true. duration: ${durationInMillis} >= (${runDelayInMillis - margin})`,
        );
        return true;
    } else {
        console.log(
            `isTimeToQuit: false. duration: ${durationInMillis} < (${runDelayInMillis - margin})`,
        );
        return false;
    }
};
export const getWorkflowId = (
    orgId: string,
    projectId: string,
    workItemType: string,
): string => {
    return slugify(`${orgId}.${projectId}.${workItemType}`).toLowerCase();
};
export const handleRateLimit = async (
    orgId: string,
    datasourceId: string,
    runDate: string,
    runParameters: ServiceDetails,
    retryDateString: string,
    datasource: IDatasource,
): Promise<void> => {
    const nextRunDate = DateTime.fromISO(runDate).plus({
        minutes: runParameters.runDelayInMinutes,
    });
    if (retryDateString && DateTime.fromISO(retryDateString) > nextRunDate) {
        await datasource.updateStateLastRun(
            orgId,
            datasourceId,
            retryDateString,
            runParameters.nextRunStartFrom!,
        );
    }
};

export const changeBatchSize = async (
    orgId: string,
    datasourceId: string,
    direction: BatchSizeDirection,
    currentBatchSize: number,
    datasource: IDatasource,
): Promise<void> => {
    const batchSizeChangeRate = BatchSizeChangeRate;
    const newBatchSize = currentBatchSize + direction * batchSizeChangeRate;
    if (
        newBatchSize >= BatchSizeLimit.MIN &&
        newBatchSize <= BatchSizeLimit.MAX
    )
        await datasource.updateStateBatchSize(
            orgId,
            datasourceId,
            newBatchSize,
        );
};

export enum EventType {
    SNS,
    SQS,
}
export const getEventType = (event: SQSEvent | SNSEvent) => {
    if ((event as SQSEvent).Records[0]?.body) {
        return EventType.SQS;
    }
    if ((event as SNSEvent).Records[0]?.Sns) {
        return EventType.SNS;
    }
};
export const parseSQSPayloads = (event: SQSEvent) => {
    const payloads: any[] = [];
    for (const record of event.Records) {
        const body = JSON.parse(record.body);
        payloads.push(body);
    }
    return payloads;
};

export const parseSNSPayloads = (event: SNSEvent) => {
    const payloads: any[] = [];

    for (const record of event.Records) {
        const message = JSON.parse(record.Sns.Message);
        payloads.push(message);
    }
    return payloads;
};
