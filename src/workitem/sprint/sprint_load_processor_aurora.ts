import { DateTime } from "luxon";
import { Logger } from 'pino';
import { Sequelize } from 'sequelize';
import { SprintModel } from "../../data/models/SprintModel";
import { SprintWorkItemMapModel } from "../../data/models/SprintWorkItemMapModel";
import { FlomatikaSprint, SprintWorkItemMapBase } from "../../process_interfaces/extract_sprints_process_interface";


export class SprintLoadProcessor {
    private logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize; }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async processSprint(
        item: FlomatikaSprint,
    ): Promise<void> {
        await this.addOrUpdateSprint(item);
    }

    async processSprintWorkItemMap(
        item: SprintWorkItemMapBase,
    ): Promise<void> {
        await this.addOrUpdateSprintWorkItemMap(item);
    }

    private async addOrUpdateSprint(
        item: FlomatikaSprint,
    ): Promise<void> {
        if (!item.orgId || item.orgId === '') return undefined;

        try {
            const aurora = await this.database;

            const sprintModel = SprintModel(aurora, Sequelize);

            const state = {
                ...item,
                startDate: item.startDate?.toISO(),
                endDate: item.endDate?.toISO(),
                flomatikaCreatedDate: DateTime.utc().toISO(),
            };

            await sprintModel.upsert(state);

            this.logger.debug(
                `[${item.orgId}] saved sprint item: ${JSON.stringify(item)}`,
            );
        } catch (err) {
            this.logger.error(
                `[SPRINT: ${item.orgId}] Failed loading notification. %o`,
                err,
            );
        }
    }

    private async addOrUpdateSprintWorkItemMap(
        item: SprintWorkItemMapBase,
    ): Promise<void> {
        if (!item.orgId || item.orgId === '') return undefined;

        try {
            const aurora = await this.database;
            const sprintModel = SprintWorkItemMapModel(aurora);
            await sprintModel.upsert(item);

            this.logger.debug(
                `[${item.orgId}] saved sprint item: ${JSON.stringify(item)}`,
            );
        } catch (err) {
            this.logger.error(
                `[SPRINT: ${item.orgId}] Failed loading notification. %o`,
                err,
            );
        }
    }
}