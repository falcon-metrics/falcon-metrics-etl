import { SecretsManagerClient } from './secretsmanager_client';

const DATABASE_HOST_SECRET_PREFIX = 'database-host-reader-secret';
/**
 * @deprecated
 */
const HOST_KEY = 'host';
const RDS_PROXY = 'rds_proxy';
const HEIMDALL_PROXY = 'heimdall_proxy';
const PASSWORD_KEY = 'password';

export interface IAuroraSecret {
    getHost(): Promise<string | undefined>;
    getPassword(): Promise<string | undefined>;
}

export class AuroraSecret
    extends SecretsManagerClient
    implements IAuroraSecret {
    async getHost(): Promise<string | undefined> {
        this.logger.debug(
            'AuroraSecret retrieving host secret: %s',
            DATABASE_HOST_SECRET_PREFIX,
        );

        let host;
        if (process.env.LOCAL_DATABASE_CREDENTIALS === 'true') {
            host = process.env.DATABASE_HOST;
        } else {
            host = await this.getSecret(
                DATABASE_HOST_SECRET_PREFIX,
                HEIMDALL_PROXY,
            );
        }

        return host;
    }

    async getPassword(): Promise<string | undefined> {
        this.logger.debug(
            'AuroraSecret retrieving password secret: %s',
            DATABASE_HOST_SECRET_PREFIX,
        );

        let password;

        if (process.env.LOCAL_DATABASE_CREDENTIALS === 'true') {
            password = process.env.DATABASE_PASSWORD;
        } else {
            password = await this.getSecret(
                DATABASE_HOST_SECRET_PREFIX,
                PASSWORD_KEY,
            );
        }

        return password;
    }
}
