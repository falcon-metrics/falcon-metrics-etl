import { IDatasource } from '../data/datasource_aurora';
import {
    ExtractType,
    IExtractKickoffNotifier,
} from '../notifications/extract_kickoff_notifier';
import { isDev } from '../utils/dev';
import { Logger } from 'pino';

export class DataExtractRequestor {
    private datasource: IDatasource;
    private notifier: IExtractKickoffNotifier;
    private logger: Logger;

    constructor(opts: any) {
        this.datasource = opts.datasource;
        this.notifier = opts.extractKickoffNotifier;
        this.logger = opts.logger;
        this.logger = opts.logger;
    }

    async sendRequestsToExtract(extractType: ExtractType) {
        const datasources = (await this.datasource.getAll()).filter(
            (datasource) => {
                if (isDev) return datasource.runType;
                // If not development, keep only the enabled datasources
                return datasource.enabled && datasource.runType;
            },
        );

        if (datasources.length === 0) {
            this.logger.warn({
                message: 'No datasources to process. Check the config',
                extractType,
            });
        }
        for (const item of datasources) {
            this.logger.info({
                message: 'Processing datasource item',
                ...item,
            });
            await this.notifier.notify(
                extractType,
                item.orgId,
                item.datasourceId,
                item.datasourceType,
            );
        }

        this.logger.info({
            message: 'Requests sent to extractor',
            count: datasources.length,
        });
    }
}
