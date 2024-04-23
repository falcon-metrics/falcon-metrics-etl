import { VCSourceType } from '../data/vc_data';
import { SecretsManagerClient } from '../secrets/secretsmanager_client';

export interface GitDataExtractor {
    extract(orgId: string, projectId: string): Promise<void>;
    queueProjectForExtract(orgId: string, projectId: string): Promise<void>;
}

export class SecretsManager extends SecretsManagerClient {
    // TODO: Add condition for local?
    private AUTH_TOKEN = 'VC_TOKEN';

    async getToken(orgId: string, projectId: string, sourceType: VCSourceType) {
        const name = `${orgId}-${projectId}-${sourceType.toLowerCase()}`;
        return this.getSecret(name, this.AUTH_TOKEN);
    }
}
