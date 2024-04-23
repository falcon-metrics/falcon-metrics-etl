import AWS from 'aws-sdk';
import { RawItem } from '../process_interfaces/revision_process_interface';
import { isDev, useLocalS3 } from '../utils/dev';
import { Logger } from 'pino';

export interface IS3Client {
    uploadItem(rawItem: RawItem): Promise<string>;
    getItemFromKey(itemKey: string): Promise<RawItem>;
    uploadWorkItemArray(
        workItemArray: string[],
        contextId: string,
        orgId: string,
        datasourceId: string,
    ): Promise<string>;
    getWorkItemArrayFromKey(key: string): Promise<string[]>;
}

export class S3Client implements IS3Client {
    private S3: AWS.S3;
    private bucketName: string;
    private logger: Logger;

    constructor(opt: { logger: Logger }) {
        if (isDev && useLocalS3) {
            this.S3 = new AWS.S3({
                s3ForcePathStyle: true,
                accessKeyId: 'S3RVER', // This specific key is required when working offline
                secretAccessKey: 'S3RVER',
                endpoint: new AWS.Endpoint('http://localhost:4569'),
            });
            this.bucketName = 'flomatika-local-bucket';
        } else {
            this.S3 = new AWS.S3();
            this.bucketName = 'flomatika-etl-extract';
        }
        this.logger = opt.logger;
    }
    public getItemKey = (rawItem: RawItem): string => {
        const flomatikaFields = rawItem.flomatikaFields;
        return `${flomatikaFields.orgId}/${flomatikaFields.datasourceType}-${flomatikaFields.datasourceId}/${flomatikaFields.workItemId}.json`;
    };
    async uploadItem(rawItem: RawItem): Promise<string> {
        const itemKey = this.getItemKey(rawItem);
        const uploadParams: AWS.S3.PutObjectRequest = {
            Bucket: this.bucketName,
            Key: itemKey,
            Body: JSON.stringify(rawItem),
            CacheControl: 'no-cache',
        };

        const result = await this.uploadItemToS3(
            this.S3,
            uploadParams,
            rawItem,
        );
        if (result) {
            return this.getItemKey(rawItem);
        } else {
            throw Error(`Upload item ${itemKey} failed`);
        }
    }
    async uploadWorkItemArray(
        workItemArray: string[],
        contextId: string,
        orgId: string,
        datasourceId: string,
    ): Promise<string> {
        const s3Key = `${orgId}--${datasourceId}--${contextId}.json`;
        const uploadParams: AWS.S3.PutObjectRequest = {
            Bucket: this.bucketName,
            Key: s3Key,
            Body: JSON.stringify(workItemArray),
            CacheControl: 'no-cache',
        };
        try {
            const result = await this.putObjectWrapper(this.S3, uploadParams);
            this.logger.info({
                message: 'Sent to s3',
                s3Key: s3Key,
                result: result,
                // uploadParams
            });
            if (result) {
                return s3Key;
            } else {
                throw Error(
                    `Couldnt upload the work item array for ${contextId}--${orgId}`,
                );
            }
        } catch (error) {
            const errorMessage = `Couldnt upload the work item array for ${contextId}--${orgId} , failed with error ${(error as Error).message}`;
            throw Error(errorMessage);
        }
    }

    async getWorkItemArrayFromKey(key: string): Promise<string[]> {
        const getParams = {
            Bucket: this.bucketName,
            Key: key,
        };
        try {
            const result = await this.getObjectWrapper(this.S3, getParams);
            const itemString = result.Body?.toString('utf-8');
            if (!itemString) {
                throw Error(
                    `Cannot read body of object result ${JSON.stringify(
                        result,
                    )}`,
                );
            }
            const item = JSON.parse(itemString) as string[];
            this.logger.info({
                message: 'retrieved work item ids from s3',
                // items: JSON.stringify(item)
            });
            return item;
        } catch (error) {
            this.logger.error({
                message: 'Failed to get the work item array from S3',
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
                key,
            });
            const errorMessage = `get work item array ${key} failed with error ${(error as Error).message}`;
            throw Error(errorMessage);
        }
    }
    async getItemFromKey(itemKey: string): Promise<RawItem> {
        const getParams = {
            Bucket: this.bucketName,
            Key: itemKey,
        };
        try {
            const result = await this.getObjectWrapper(this.S3, getParams);
            const itemString = result.Body?.toString('utf-8');
            if (!itemString) {
                throw Error(
                    `Cannot read body of object result ${JSON.stringify(
                        result,
                    )}`,
                );
            }
            const item = JSON.parse(itemString) as RawItem;
            return item;
        } catch (error) {
            this.logger.error({
                message: 'Failed to get the item from S3',
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
                itemKey,
            });
            const errorMessage = `get item ${itemKey} failed with error ${(error as Error).message}`;
            throw Error(errorMessage);
        }
    }
    private putObjectWrapper(
        s3: AWS.S3,
        params: AWS.S3.PutObjectRequest,
    ): Promise<AWS.S3.PutObjectOutput> {
        return new Promise((resolve, reject) => {
            s3.putObject(params, function (err, result) {
                if (err) reject(err);
                if (result) resolve(result);
            });
        });
    }
    private getObjectWrapper(
        s3: AWS.S3,
        params: AWS.S3.GetObjectRequest,
    ): Promise<AWS.S3.GetObjectOutput> {
        return new Promise((resolve, reject) => {
            s3.getObject(params, function (err, result) {
                if (err) reject(err);
                if (result) resolve(result);
            });
        });
    }
    private async uploadItemToS3(
        s3: AWS.S3,
        uploadParams: AWS.S3.PutObjectRequest,
        rawItem: RawItem,
    ): Promise<AWS.S3.PutObjectOutput> {
        try {
            const result = await this.putObjectWrapper(s3, uploadParams);
            return result;
        } catch (error) {
            const errorMessage = `[${rawItem.flomatikaFields.orgId}][${rawItem.flomatikaFields.datasourceType}]: upload item ${rawItem.flomatikaFields.workItemId} failed with error ${(error as Error).message}`;
            throw Error(errorMessage);
        }
    }
}
