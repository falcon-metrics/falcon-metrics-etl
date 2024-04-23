/**
 * TODO: better comment
 *
 * Overrides for local development
 */

import { mkdirSync } from 'fs';

const IS_DEV = 'ETL_IS_DEV';
const ORG_ID = 'ETL_ORG_ID';
const DATASOURCE_ID = 'ETL_DATASOURCE_ID';
const LOCAL_BUCKET_PATH = 'ETL_LOCAL_BUCKET_PATH';
const USE_LOCAL_S3 = 'ETL_USE_LOCAL_S3';

let rate = 5;
let orgId = '',
    datasourceId = '';

const localBucketPath = process.env[LOCAL_BUCKET_PATH];
const isDev = process.env[IS_DEV]?.toLowerCase() === 'true';
const useLocalS3 = process.env[USE_LOCAL_S3]?.toLowerCase() === 'true';
if (isDev) {
    if (!localBucketPath) {
        throw new Error(`${LOCAL_BUCKET_PATH} env variable is not set`);
    }

    try {
        mkdirSync(localBucketPath);
    } catch (e) {
        if ((e as any).code === 'EEXIST') {
            console.log(`${localBucketPath} directory exists`);
        } else {
            console.warn(
                `Error creating the local S3 bucket at path ${LOCAL_BUCKET_PATH}`,
            );
            throw e;
        }
    }
    orgId = process.env[ORG_ID] ?? '';
    datasourceId = process.env[DATASOURCE_ID] ?? '';

    if (!orgId) {
        throw new Error(`${ORG_ID} env variable is not set`);
    }
    if (!datasourceId) {
        throw new Error(`${DATASOURCE_ID} env variable is not set`);
    }

    rate = 1;
}

export { isDev, rate, datasourceId, orgId, useLocalS3 };
