import _ from 'lodash';
import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { ModelStatic, Sequelize } from 'sequelize';
import { CommitModel } from './models/Commit';
import { MergeRequestModel } from './models/MergeRequest';
import { MergeRequestCommitModel } from './models/MergeRequestCommit';
import { VCProjectModel } from './models/VCProject';
import { PipelineModel } from './models/Pipeline';

export enum VCSourceType {
    GITHUB = 'github',
    GITLAB = 'gitlab',
}

export type VCProjectItem = {
    orgId: string;
    id: string;
    name: string;
    sourceType: VCSourceType;
    url: string;
    path: string;
    mainBranchName: string;
    excludeBefore: DateTime;
    nextRunStartsFrom: {
        mergeRequests?: DateTime;
        pipelines?: DateTime;
    };
};

export type CommitItem = {
    sha: string;
    committedDate: DateTime;
    committerEmail: string;
    committerName: string;
    projectId: string;
    orgId: string;
    createdAt?: DateTime;
    updatedAt?: DateTime;
    deletedAt?: DateTime | null;
};

export type MergeRequestItem = {
    id: string;
    title: string;
    mergeCommitSha?: string | null;
    projectId: string;
    orgId: string;
    sourceBranch: string;
    targetBranch: string;
    mrCreatedAt: Date;
    mrMergedAt: Date;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
};

export type MergeRequestCommitItem = {
    commitSha: string;
    mergeRequestId: string;
    projectId: string;
    orgId: string;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
};

export type PipelineItem = {
    id: string;
    finishedAt: DateTime;
    mergeCommitSha?: string;
    status?: string;
    orgId: string;
    projectId: string;
    createdAt?: DateTime;
    updatedAt?: DateTime;
    deletedAt?: DateTime;
};

export class VCData {
    protected logger: Logger;
    private database: Promise<Sequelize>;
    CHUNK_SIZE = 500;

    constructor(opt: {
        logger: Logger;
        orgId: string;
        database: Promise<Sequelize>;
    }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async getProjects(orgId: string, sourceType?: VCSourceType) {
        const database = await this.database;
        const model = VCProjectModel(database);
        const where: any = {
            orgId,
        };
        if (sourceType) {
            where.sourceType = sourceType;
        }
        const rows = await model.findAll({
            where,
        });
        return rows.map((row) => this.buildVCProject(row));
    }

    private async getProjectModel(
        orgId: string,
        projectId: string,
        sourceType?: VCSourceType,
    ) {
        const database = await this.database;
        const model = VCProjectModel(database);
        let where: any = {
            orgId,
            id: projectId,
        };
        if (sourceType) {
            where = {
                ...where,
                sourceType,
            };
        }
        const project = await model.findOne({
            where,
        });
        return project;
    }

    async getProject(
        orgId: string,
        projectId: string,
        sourceType?: VCSourceType,
    ) {
        const obj = await this.getProjectModel(orgId, projectId);
        return this.buildVCProject(obj);
    }

    private buildNextRunStartsFrom(obj: any) {
        const result: any = {};
        const { mergeRequests, pipelines } = obj?.nextRunStartsFrom ?? {};
        if (mergeRequests && DateTime.fromISO(mergeRequests).isValid) {
            result.mergeRequests = DateTime.fromISO(mergeRequests);
        }
        if (pipelines && DateTime.fromISO(pipelines).isValid) {
            result.pipelines = DateTime.fromISO(pipelines);
        }

        return result;
    }

    private buildVCProject(obj: any): VCProjectItem {
        const json = obj?.toJSON();

        return {
            ...json,
            excludeBefore: DateTime.fromJSDate(obj.excludeBefore),
            nextRunStartsFrom: this.buildNextRunStartsFrom(obj),
        };
    }

    async updateNextRunStartFrom(
        orgId: string,
        projectId: string,
        nextRunStartsFrom: VCProjectItem['nextRunStartsFrom'],
    ): Promise<void> {
        const projectModel = await this.getProjectModel(orgId, projectId);
        if (!projectModel) {
            throw new Error('project not found');
        }

        type NextRunStartFromType = {
            [K in keyof VCProjectItem['nextRunStartsFrom']]?: string;
        };

        const objToWrite: NextRunStartFromType = {
            ...(projectModel.toJSON().nextRunStartsFrom ?? {}),
        };

        if (nextRunStartsFrom.mergeRequests) {
            objToWrite.mergeRequests =
                nextRunStartsFrom.mergeRequests.toISO() ?? undefined;
        }
        if (nextRunStartsFrom.pipelines) {
            objToWrite.pipelines =
                nextRunStartsFrom.pipelines.toISO() ?? undefined;
        }

        projectModel.set('nextRunStartsFrom', objToWrite);
        const returnedModel = await projectModel.save();
    }

    async bulkInsert(
        model: ModelStatic<any>,
        objs: Array<Record<any, any>>,
        updateOnDuplicate: string[],
    ): Promise<void> {
        const database = await this.database;
        const transaction = await database.transaction();
        try {
            const chunks = _.chunk(objs, this.CHUNK_SIZE);
            for (const chunk of chunks) {
                await model.bulkCreate(chunk, {
                    transaction,
                    // If the row is a duplicate row, update the following fields
                    // Adding all fields here except createdAt
                    updateOnDuplicate,
                });
            }
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    public async insertCommits(commits: Array<CommitItem>): Promise<void> {
        const database = await this.database;
        const model = CommitModel(database);
        const updateOnDuplicate = ['sha', 'orgId', 'projectId'];
        const commitsToInsert = _.chain(commits)
            .map((c) => ({
                ...c,
                committedDate: c.committedDate.toJSDate(),
            }))
            .uniqBy((c) => `${c.orgId}#${c.projectId}#${c.sha}`)
            .value();
        const groups = _.groupBy(
            commitsToInsert,
            (row) => `${row.orgId}#${row.projectId}#${row.sha}`,
        );

        return this.bulkInsert(model, commitsToInsert, updateOnDuplicate);
    }

    public async insertMergeRequests(
        mrs: Array<MergeRequestItem>,
    ): Promise<void> {
        const database = await this.database;
        const model = MergeRequestModel(database);
        const updateOnDuplicate = ['id', 'orgId', 'projectId'];
        const mrsToInsert = _.chain(mrs)
            .uniqBy((mr) => `${mr.orgId}#${mr.projectId}#${mr.id}`)
            .value();
        return this.bulkInsert(model, mrsToInsert, updateOnDuplicate);
    }

    public async insertMergeRequestCommits(
        mrCommits: Array<MergeRequestCommitItem>,
    ): Promise<void> {
        const database = await this.database;
        const model = MergeRequestCommitModel(database);
        const updateOnDuplicate = [
            'commitSha',
            'mergeRequestId',
            'orgId',
            'projectId',
        ];
        const mrCommitsToInsert = _.chain(mrCommits)
            .uniqBy(
                (mr) =>
                    `${mr.orgId}#${mr.projectId}#${mr.commitSha}#${mr.mergeRequestId}`,
            )
            .value();
        return this.bulkInsert(model, mrCommitsToInsert, updateOnDuplicate);
    }
    public async insertPipelines(
        pipelines: Array<PipelineItem>,
    ): Promise<void> {
        const database = await this.database;
        const model = PipelineModel(database);
        const updateOnDuplicate = ['id', 'orgId', 'projectId'];
        const pipelinesToInsert = _.chain(pipelines)
            .map((p) => ({
                ...p,
                finishedAt: p.finishedAt.toJSDate(),
            }))
            .uniqBy((p) => `${p.orgId}#${p.projectId}#${p.id}`)
            .value();
        return this.bulkInsert(model, pipelinesToInsert, updateOnDuplicate);
    }
}
