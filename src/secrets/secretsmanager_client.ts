import AWS from 'aws-sdk';
import { Logger } from 'pino';

export abstract class SecretsManagerClient {
    protected client: AWS.SecretsManager;
    protected logger: Logger;

    constructor(opts: { logger: Logger }) {
        let clientOptions: AWS.SecretsManager.ClientConfiguration;

        this.logger = opts.logger;

        if (process.env.IS_OFFLINE) {
            clientOptions = {
                region: 'localhost',
            };
        } else {
            clientOptions = {};
        }
        this.client = new AWS.SecretsManager(clientOptions);
    }

    async getSecret(secretId: string, key: string): Promise<string> {
        this.logger.debug('SecretsManager fetching secret: ', secretId);

        if (process.env.IS_OFFLINE) {
            return process.env[secretId]!;
        }

        return this.client
            .getSecretValue({ SecretId: secretId })
            .promise()
            .then((data: any) => { // eslint-disable-line
                let decodedBinarySecret: string;

                if ('SecretString' in data) {
                    decodedBinarySecret = JSON.parse(data.SecretString)[key];
                } else {
                    const buff = new Buffer(data.SecretBinary, 'base64');
                    decodedBinarySecret = buff.toString('ascii');
                }

                return decodedBinarySecret;
            })
            .catch((error) => {
                this.logger.error(`[SECRET] Failed to get secret: ${secretId}`);
                throw error;
            });
    }
    async deleteSecret(secretId: string): Promise<void> {
        this.logger.debug('SecretsManager fetching secret: ', secretId);
        try {
            await this.client
                .deleteSecret({
                    SecretId: secretId,
                    ForceDeleteWithoutRecovery: true,
                })
                .promise();
            this.logger.info(`${secretId} deleted`);
        } catch (error) {
            this.logger.error(
                `[SECRET] Failed to deleted secret: ${secretId} %o`,
                error,
            );
        }
    }
}
