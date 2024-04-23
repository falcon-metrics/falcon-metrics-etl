import { SecretsManagerClient } from './secretsmanager_client';

const AUTH0_SECRET_NAME = 'AUTH0_M2M';

export interface IAuth0Secret {
    getClientId(): Promise<string | undefined>;
    getClientSecret(): Promise<string | undefined>;
}

export class Auth0Secret extends SecretsManagerClient implements IAuth0Secret {
    async getClientId(): Promise<string | undefined> {
        if (process.env.IS_OFFLINE) {
            return process.env['AUTH0_M2M_API_CLIENT_ID'];
        }

        return this.getSecret(AUTH0_SECRET_NAME, 'CLIENT_ID');
    }

    async getClientSecret(): Promise<string | undefined> {
        if (process.env.IS_OFFLINE) {
            return process.env['AUTH0_M2M_API_CLIENT_SECRET'];
        }

        return this.getSecret(AUTH0_SECRET_NAME, 'CLIENT_SECRET');
    }
}
