import { SecretsManagerClient } from './secretsmanager_client';

const DATASOURCE_SECRET_PREFIX = 'flomatika-datasource-secret';
const DATASOURCE_SECRET_TOKEN_KEY = 'accessToken';

export interface IDatasourceSecret {
    getToken(
        bizUnitId: string,
        datasourceId: string,
    ): Promise<string | undefined>;
}

export class DatasourceSecret
    extends SecretsManagerClient
    implements IDatasourceSecret
{
    async getToken(
        bizUnitId: string,
        datasourceId: string,
    ): Promise<string | undefined> {
        if (!bizUnitId || !datasourceId) {
            this.logger.error(
                'DATASOURCE: [SECRET] DatasourceSecret bizUnitId or datasourceId missing',
            );
            return undefined;
        }

        const secretName = `${DATASOURCE_SECRET_PREFIX}/${bizUnitId}/${datasourceId}`;

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
}
