/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { updateMockData } from './date_update_utils';
import aws from 'aws-sdk';
const MOCK_DATA_BUCKET = 'flomatika-mock-data';
const MOCK_DATA_CONTEXTS = process.env.MOCK_DATA_CONTEXTS?.split(',');

export const handler = async () => {
    console.log('handler runs');
    const mockDataPaths = MOCK_DATA_CONTEXTS!.map(
        (context: any) => `${context}/data.json`,
    );
    const s3 = new aws.S3();
    const putResults = [];

    for (const path of mockDataPaths) {
        ///get the data file from the path
        try {
            const data = await s3
                .getObject({
                    Bucket: MOCK_DATA_BUCKET,
                    Key: path,
                })
                .promise();
            const updatedData = updateMockData(
                JSON.parse(data.Body!.toString('utf-8')),
            );
            const putResult = await s3
                .putObject({
                    Bucket: MOCK_DATA_BUCKET,
                    Key: path,
                    Body: JSON.stringify(updatedData),
                    ContentType: 'application/json',
                })
                .promise();
            putResults.push(putResult);
        } catch (error) {
            console.log(error);
            console.log(path);
        }
    }
    return putResults;
};
