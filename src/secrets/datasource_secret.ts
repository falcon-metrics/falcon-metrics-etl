import { SecretsManagerClient } from './secretsmanager_client';

const DATASOURCE_SECRET_PREFIX = 'datasource-secret';
const DATASOURCE_SECRET_TOKEN_KEY = 'accessToken';

export interface IDatasourceSecret {
    getToken(
        orgId: string,
        datasourceId: string,
        secretId: string,
    ): Promise<string | undefined>;
    deleteSecretToken(orgId: string, datasourceId: string): Promise<void>;
}

export class DatasourceSecret
    extends SecretsManagerClient
    implements IDatasourceSecret {
    private formatSecretId(orgId: string, datasourceId: string) {
        return `${DATASOURCE_SECRET_PREFIX}/${orgId}/${datasourceId}`;
    }
    async getToken(
        orgId: string,
        datasourceId: string,
    ): Promise<string | undefined> {
        if (!orgId || !datasourceId) {
            this.logger.error('DatasourceSecret orgId or datasourceId missing');
            return undefined;
        }

        const secretName = `${DATASOURCE_SECRET_PREFIX}/${orgId}/${datasourceId}`;

        this.logger.debug(
            'DatasourceSecret retriving token secret: %s',
            secretName,
        );

        const token = await this.getSecret(
            secretName,
            DATASOURCE_SECRET_TOKEN_KEY,
        );

        return token;
    }
    async deleteSecretToken(
        orgId: string,
        datasourceId: string,
    ): Promise<void> {
        if (!orgId || !datasourceId) {
            this.logger.error('DatasourceSecret orgId or datasourceId missing');
            return undefined;
        }

        const secretName = this.formatSecretId(orgId, datasourceId);

        this.logger.debug(
            'DatasourceSecret delete token secret: %s',
            secretName,
        );

        await this.deleteSecret(secretName);
    }
}
