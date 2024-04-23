import { Logger } from 'pino';
import { StandardSnapshotItem } from './interfaces';
import { DateTime } from 'luxon';

import { Sequelize } from 'sequelize';
import { SnapshotModel } from './SnapshotModel';

export class SnapshotLoadProcessorAurora {
    private logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async process(
        orgId: string,
        datasourceId: string,
        item: StandardSnapshotItem,
    ): Promise<void> {
        await this.addOrUpdate(orgId, datasourceId, item);
    }
    private async upsert(snapshot: StandardSnapshotItem) {
        const aurora = await this.database;
        const snapshotModel = SnapshotModel(aurora, Sequelize);
        if (snapshot.assignedTo === undefined) {
            snapshot.assignedTo = null;
        }
        if (snapshot.title === undefined) {
            snapshot.title = null;
        }
        await snapshotModel.upsert(snapshot);
    }
    private async addOrUpdate(
        orgId: string,
        datasourceId: string,
        item: StandardSnapshotItem,
    ): Promise<void> {
        if (!orgId || orgId === '') return undefined;
        if (!datasourceId || datasourceId === '') return undefined;
        try {
            const aurora = await this.database;
            const snapshot = {
                ...item,
                partitionKey: `snapshot#${orgId}`,
                gs2PartitionKey: `${orgId}#${datasourceId}#${item.workItemId}`,
                sortKey: `${item.flomatikaSnapshotDate}#${item.workItemId}`,
                gs2SortKey: `${item.flomatikaSnapshotDate}`,
                flomatikaCreatedDate: DateTime.utc().toISO(),
            };
            await this.upsert(snapshot);
            this.logger.info({
                message: 'Saved snapshot',
                workItemId: item.workItemId,
                revision: item.revision,
                type: item.type,
                orgId,
                datasourceId,
            });
        } catch (err) {
            this.logger.error(
                `COMMON: [SNAPSHOT: ${orgId}] Failed loading notification. when loading snapshot item: ${JSON.stringify(
                    item,
                )} ERROR: %o`,
                err,
            );
        }
    }
}
