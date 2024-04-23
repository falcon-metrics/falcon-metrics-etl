/* eslint-disable @typescript-eslint/no-non-null-assertion */
import sequelize, { Model, Op, Sequelize } from 'sequelize';
import { Logger } from 'pino';
import { WorkflowModel } from './models/WorkflowModel';
import { WorkflowStepsModel } from './models/WorkflowStepsModel';
import { WorkflowEventsModel } from './models/WorkflowEventsModel';
import { WorkItemTypeMapModel } from './models/WorkItemTypeMapModel';
import { WorkItemTypeModel } from './models/WorkItemTypeModel';
import slugify from 'slugify';
import { FG_COLOR } from '../utils/log_colors';
import { WorkflowStepItem } from '../common/unmapped_workflow_step';

export type WorkItemTypeItem = {
    id: string;
    displayName?: string;
    level?: string;
    serviceLevelExpectationInDays?: number;
};

export type WorkItemTypeDbItem = {
    workItemTypeName: string;
    workflowId: string;
    workItemTypeId: string;
    datasourceWorkItemId: string;
    projectId: string;
    level: string;
    serviceLevelExpectationInDays: null;
};

export type WorkflowItem = {
    orgId: string;
    datasourceId: string;
    workflowId: string;
    workflowName: string;
    projectId?: string;
};

export type WorkItemTypeMapItem = {
    id: string;
    name?: string;
    workItemTypeId?: string;
    datasourceWorkItemId?: string;
    workflowId?: string;
    active?: boolean;
    archived?: boolean;
    projectId: string;
    serviceLevelExpectationInDays: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IWorkItemType {}

export type Workflow = {
    orgId: string;
    datasourceId: string;
    workflowId: string;
    name?: string;
    workflowSteps?: Array<WorkflowStep>;
    workflowEvents?: WorkflowEvents;
    projectId?: string;
    datasourceWorkflowId?: string;
};

export type WorkflowStepKey = {
    id?: string;
    name?: string;
    order?: number;
};

export function IsSameWorkflowStepKey(
    stepA: WorkflowStepKey,
    stepB: WorkflowStepKey,
) {
    return stepA.id === stepB.id && stepA.name === stepB.name;
}

export type WorkflowStep = {
    workflowId: string;
    id?: string;
    name?: string;
    stateCategory?: string;
    stateType?: string;
    order?: number;
    active?: boolean;
    key?: WorkflowStepKey;
    projectId?: string;
};

export type WorkflowEvents = {
    arrivalPointOrder?: number;
    commitmentPointOrder?: number;
    departurePointOrder?: number;
};

export interface IWorkItemTypeMap {
    getWorkItemTypeId(
        orgId: string,
        datasourceId: string,
        datasourceTypeValue: string,
    ): Promise<string>;

    getWorkflowId(
        orgId: string,
        datasourceId: string,
        datasourceTypeValue: string,
        projectId?: string,
        issueTypeName?: string,
    ): Promise<string>;

    getWorkflow(
        orgId: string,
        datasourceId: string,
        workflowId: string,
    ): Promise<Workflow | undefined>;

    getWorkflows(orgId: string, datasourceId: string): Promise<Workflow[]>;

    getWorkItemTypeMaps(
        orgId: string,
        datasourceId: string,
    ): Promise<WorkItemTypeMapItem[]>;

    getWorkItemTypeMap(
        orgId: string,
        datasourceId: string,
        workItemTypeId: string,
        projectId: string,
    ): Promise<WorkItemTypeMapItem | undefined>;

    getWorkflowStep(
        orgId: string,
        datasourceId: string,
        datasourceTypeValue: string,
        workflowId: string,
        workflowStepName: string,
        workflowStepId?: string,
        isState?: boolean,
    ): Promise<WorkflowStep>;

    getWorkItemType(
        orgId: string,
        datasourceId: string,
        workItemTypeId: string,
    ): Promise<WorkItemTypeItem>;

    getWorkItemTypes(
        orgId: string,
        datasourceId: string,
        workItemTypeId?: string[],
    ): Promise<WorkItemTypeItem[]>;

    archiveWorkItemTypeMap(
        orgId: string,
        datasourceId: string,
        workItemTypeMapIds: (string | undefined)[],
    ): Promise<void>;
}

export class WorkItemType implements IWorkItemType {}

export class WorkItemTypeMap implements IWorkItemTypeMap {
    protected logger: Logger;
    private database: Sequelize;

    constructor(opt: { logger: Logger; database: Sequelize }) {
        this.logger = opt.logger;
        this.database = opt.database;
        this.logger = opt.logger;
    }

    async getAllWorkflows(
        orgId: string,
        datasourceId: string,
    ): Promise<Workflow[]> {
        if (!orgId) throw new Error('getAllWorkflows. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getAllWorkflows. Datasource id is mandatory');

        const workflows: Workflow[] = [];

        const allWorkflowsPredicate = {
            where: {
                orgId,
                datasourceId,
                deletedAt: null,
            },
        };

        const workflowModel = WorkflowModel(await this.database, Sequelize);
        const allWorkflowsDb: any = await workflowModel.findAll(
            allWorkflowsPredicate,
        );

        for await (const workflowDb of allWorkflowsDb) {
            const workflow: Workflow = {
                orgId: workflowDb.get('orgId') as string,
                datasourceId: workflowDb.get('datasourceId') as string,
                workflowId: workflowDb.get('workflowId') as string,
                name: workflowDb.get('workflowName') as string,
            };

            const workflowSteps: WorkflowStep[] =
                await this.getWorkflowStepsForWorkflow(workflow);
            workflow.workflowSteps = workflowSteps;

            const workflowEvents: WorkflowEvents =
                await this.getWorkflowEventsForWorkflow(workflow);
            workflow.workflowEvents = workflowEvents;

            workflows.push(workflow);
        }

        return workflows;
    }

    async getWorkflowStep(
        orgId: string,
        datasourceId: string,
        datasourceTypeValue: string,
        workflowId: string,
        workflowStepName?: string,
        workflowStepId?: string,
        isState?: boolean,
    ): Promise<any> {
        if (!orgId) throw new Error('getWorfklowStep. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getWorfklowStep. Datasource id is mandatory');
        if (!workflowId)
            throw new Error('getWorfklowStep. WorkflowId value is mandatory');
        if (!workflowStepId && !workflowStepName)
            throw new Error(
                'getWorfklowStep. workflowStepId or name value is mandatory',
            );

        const workflowStepPredicate = {
            where: {
                orgId,
                workflowId,
            } as { [key: string]: string }, //so we can use string as key
        };
        if (workflowStepId) {
            workflowStepPredicate.where['id'] = workflowStepId;
        }
        if (workflowStepName) {
            workflowStepPredicate.where['name'] = workflowStepName; //if it only has name (for azure)
        }

        const workflowStepModel = WorkflowStepsModel(
            await this.database,
            Sequelize,
        );
        const workflowStepDb: any = await workflowStepModel.findOne(
            workflowStepPredicate,
        );
        if (!workflowStepDb) {
            this.logger.error({
                message: 'missing workflow step',
                workflowStepName,
                workflowStepId,
                workflowId,
                orgId,
                datasourceId,
            });
        }

        return workflowStepDb?.toJSON();
    }

    async getWorkflow(
        orgId: string,
        datasourceId: string,
        workflowId: string,
    ): Promise<Workflow | undefined> {
        if (!orgId) throw new Error('getWorkflow. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getWorkflow. Datasource id is mandatory');
        if (!workflowId)
            throw new Error('getWorkflow. WorkflowId value is mandatory');

        const workflowPredicate = {
            where: {
                orgId,
                datasourceId,
                workflowId,
                deletedAt: null,
            },
        };

        const workflowModel: any = WorkflowModel(
            await this.database,
            Sequelize,
        );
        const workflowDb: any = (
            await workflowModel.findOne(workflowPredicate)
        )?.toJSON() as WorkflowItem;

        if (!workflowDb) {
            return undefined;
        }

        const workflow: Workflow = {
            orgId: workflowDb.orgId,
            datasourceId: workflowDb.datasourceId,
            workflowId: workflowDb.workflowId,
            name: workflowDb.workflowName,
            projectId: workflowDb.projectId,
        };

        const workflowSteps: WorkflowStep[] =
            await this.getWorkflowStepsForWorkflow(workflow);
        workflow.workflowSteps = workflowSteps;

        const workflowEvents: WorkflowEvents =
            await this.getWorkflowEventsForWorkflow(workflow);
        workflow.workflowEvents = workflowEvents;

        return workflow;
    }

    async getWorkflows(
        orgId: string,
        datasourceId: string,
    ): Promise<Workflow[]> {
        if (orgId === undefined || datasourceId === undefined) {
            throw new Error('orgId or datasourceId is invalid');
        }

        const where = {
            where: {
                orgId,
                datasourceId,
                deletedAt: null,
            },
        };
        const sequelize = await this.database;
        const workflowModel: any = WorkflowModel(sequelize, Sequelize);

        const [workflowRows, workflowStepsRows, workflowEventsRows] =
            await Promise.all([
                workflowModel.findAll(where),
                this.getWorkflowSteps(orgId, datasourceId),
                this.getWorkflowEvents(orgId, datasourceId),
            ]);

        const workflows: Workflow[] = workflowRows.map((workflowDb: any) => {
            const workflowId = workflowDb.workflowId;
            return {
                orgId: workflowDb.orgId,
                datasourceId: workflowDb.datasourceId,
                workflowId,
                name: workflowDb.workflowName,
                projectId: workflowDb.projectId,
                datasourceWorkflowId: workflowDb.datasourceWorkflowId,
                workflowEvents: workflowEventsRows.find(
                    (wfe) => wfe.workflowId === workflowId,
                ),
                workflowSteps: workflowStepsRows.filter(
                    (wfs) => wfs.workflowId === workflowId,
                ),
            };
        });

        return workflows;
    }

    private async getWorkflowSteps(
        orgId: string,
        datasourceId: string,
    ): Promise<WorkflowStep[]> {
        const workflowStepsModel = WorkflowStepsModel(
            await this.database,
            Sequelize,
        );
        const workflowSteps: any = await workflowStepsModel.findAll({
            where: {
                orgId,
                datasourceId,
            },
        });
        return workflowSteps.map((m: any) => m.toJSON());
    }

    private async getWorkflowStepsForWorkflow(
        workflow: Workflow,
    ): Promise<WorkflowStep[]> {
        const workflowStepsModel = WorkflowStepsModel(
            await this.database,
            Sequelize,
        );
        const workflowStepsDb: any = await workflowStepsModel.findAll({
            where: {
                orgId: workflow.orgId,
                datasourceId: workflow.datasourceId,
                workflowId: workflow.workflowId,
            },
        });

        const workflowSteps: WorkflowStep[] = [];
        for (const workflowStepDbItem of workflowStepsDb) {
            const workflowStepDb = workflowStepDbItem.toJSON() as WorkflowStep;
            workflowSteps.push({
                workflowId: workflowStepDb.workflowId,
                id: workflowStepDb.id as string,
                name: workflowStepDb.name,
                stateCategory: workflowStepDb.stateCategory,
                stateType: workflowStepDb.stateType,
                order: workflowStepDb.order,
                active: workflowStepDb.active,
            });
        }
        return workflowSteps;
    }

    private async getWorkflowEventsForWorkflow(
        workflow: Workflow,
    ): Promise<WorkflowEvents> {
        const workflowEventsModel = WorkflowEventsModel(
            await this.database,
            Sequelize,
        );
        const workflowEventsDbItem: any = await workflowEventsModel.findOne({
            where: {
                orgId: workflow.orgId,
                datasourceId: workflow.datasourceId,
                workflowId: workflow.workflowId,
            },
        });

        if (!workflowEventsDbItem) {
            this.logger.error({
                message: 'Could not find workflow event',
                workflow,
                ...workflow,
            });
        }
        const workflowEventsDb =
            workflowEventsDbItem!.toJSON() as WorkflowEvents;
        const workflowEvents: WorkflowEvents = {};
        workflowEvents.arrivalPointOrder = workflowEventsDb.arrivalPointOrder;
        workflowEvents.commitmentPointOrder =
            workflowEventsDb.commitmentPointOrder;
        workflowEvents.departurePointOrder =
            workflowEventsDb.departurePointOrder;

        return workflowEvents;
    }
    private async getWorkflowEvents(orgId: string, datasourceId: string) {
        const workflowEventsModel = WorkflowEventsModel(
            await this.database,
            Sequelize,
        );
        const results: any = await workflowEventsModel.findAll({
            where: {
                orgId,
                datasourceId,
            },
        });

        return results.map((m: any) => m.toJSON()) as Array<{
            arrivalPointOrder: string;
            commitmentPointOrder: string;
            departurePointOrder: string;
            workflowId: string;
        }>;
    }

    async getWorkItemTypeMaps(
        orgId: string,
        datasourceId: string,
    ): Promise<WorkItemTypeMapItem[]> {
        if (!orgId.length) throw new Error('Org id is mandatory');
        if (!datasourceId.length) throw new Error('Datasource id is mandatory');

        const workItemTypeMapModel = WorkItemTypeMapModel(
            await this.database,
            Sequelize,
        );
        const workItemTypeMapsDb: any = await workItemTypeMapModel.findAll({
            where: {
                orgId,
                datasourceId,
                archived: {
                    [Op.or]: [false, null],
                },
            },
        });

        const workItemTypeMaps: WorkItemTypeMapItem[] = [];
        for await (const workItemTypeMapItem of workItemTypeMapsDb) {
            const workItemTypeMap =
                workItemTypeMapItem.toJSON() as WorkItemTypeDbItem;
            workItemTypeMaps.push({
                id: workItemTypeMap.workItemTypeName,
                workflowId: workItemTypeMap.workflowId,
                workItemTypeId: workItemTypeMap.workItemTypeId,
                datasourceWorkItemId: workItemTypeMap.datasourceWorkItemId,
                projectId: workItemTypeMap.projectId,
                serviceLevelExpectationInDays:
                    workItemTypeMap.serviceLevelExpectationInDays,
                // active: workItemTypeMap.active,
            });
        }

        return workItemTypeMaps;
    }

    async getWorkItemTypeMap(
        orgId: string,
        datasourceId: string,
        workItemTypeId: string,
        projectId: string,
    ): Promise<WorkItemTypeMapItem | undefined> {
        if (
            orgId === undefined ||
            datasourceId === undefined ||
            workItemTypeId === undefined ||
            projectId === undefined
        ) {
            throw new Error('One or more params is undefined');
        }

        const workItemTypeMapModel = WorkItemTypeMapModel(
            await this.database,
            Sequelize,
        );
        const workItemTypeMap: any | null = await workItemTypeMapModel.findOne({
            where: {
                orgId,
                datasourceId,
                workItemTypeId,
                projectId,
                archived: {
                    [Op.or]: [false, null],
                },
            },
        });

        if (!workItemTypeMap) return undefined;

        return {
            id: workItemTypeMap.workItemTypeName,
            workflowId: workItemTypeMap.workflowId,
            workItemTypeId: workItemTypeMap.workItemTypeId,
            datasourceWorkItemId: workItemTypeMap.datasourceWorkItemId,
            projectId: workItemTypeMap.projectId,
            serviceLevelExpectationInDays:
                workItemTypeMap.serviceLevelExpectationInDays,
        };
    }

    async getWorkItemTypeId(
        orgId: string,
        datasourceId: string,
        datasourceWorkItemId: string,
    ): Promise<string> {
        if (!orgId) throw new Error('getWorkItemTypeId. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getWorkItemTypeId. Datasource id is mandatory');
        if (!datasourceWorkItemId)
            throw new Error(
                'getWorkItemTypeId. Datasource work item type value is mandatory',
            );

        const workItemTypeMapModel = WorkItemTypeMapModel(
            await this.database,
            Sequelize,
        );
        const datasourceWorkItemType = {
            [Op.and]: [
                sequelize.where(
                    sequelize.fn(
                        'lower',
                        sequelize.col('datasourceWorkItemId'),
                    ),
                    '=',
                    datasourceWorkItemId.toLowerCase(),
                ),
            ],
        };
        const where = Object.assign(
            { orgId, datasourceId, archived: false },
            datasourceWorkItemType,
        );
        const workItemTypeMapDb: any = await workItemTypeMapModel.findOne({
            where,
        });

        let workItemTypeId = '';

        if (workItemTypeMapDb) {
            workItemTypeId = workItemTypeMapDb.get('workItemTypeId')! as string;
            return workItemTypeId;
        }

        return workItemTypeId;
    }

    async getWorkItemType(
        orgId: string,
        datasourceId: string,
        workItemTypeId: string,
    ): Promise<WorkItemTypeItem> {
        if (!orgId) throw new Error('getWorkItemType. Org id is mandatory');
        if (!workItemTypeId)
            throw new Error('getWorkItemType. workItemTypeId is mandatory');

        const workItemTypeModel = WorkItemTypeModel(
            await this.database,
            Sequelize,
        );
        const workItemTypeDb: any = await workItemTypeModel.findOne({
            where: {
                orgId,
                workItemTypeId,
                deletedAt: null,
            },
        });
        if (!workItemTypeDb) {
            const message = `workItemType not found for workItemTypeId ${workItemTypeId}`;
            this.logger.error({
                message,
                workItemTypeId,
                orgId,
                datasourceId,
            });
            throw new Error(message);
        }
        const workItemTypeItem = workItemTypeDb.toJSON() as {
            workItemTypeId: string;
            displayName: string;
            level: string;
            serviceLevelExpectationInDays: number;
        };
        const workItemType: WorkItemTypeItem = {
            id: workItemTypeItem.workItemTypeId,
            displayName: workItemTypeItem.displayName,
            level: workItemTypeItem.level,
            serviceLevelExpectationInDays:
                workItemTypeItem.serviceLevelExpectationInDays,
        };

        return workItemType;
    }
    async getWorkItemTypes(
        orgId: string,
        datasourceId: string,
        workItemTypeIds?: string[],
    ): Promise<WorkItemTypeItem[]> {
        if (!orgId) throw new Error('getWorkItemType. Org id is mandatory');

        const workItemTypeModel = WorkItemTypeModel(
            await this.database,
            Sequelize,
        );
        const where: any = {
            orgId,
            deletedAt: null,
        };
        if (workItemTypeIds && workItemTypeIds.length > 0) {
            where.workItemTypeId = { [Op.in]: workItemTypeIds };
        }
        const results: any = await workItemTypeModel.findAll({
            where,
        });

        const workItemTypes = results.map(
            (row: any) =>
                ({
                    id: row.workItemTypeId,
                    displayName: row.displayName,
                    level: row.level,
                    serviceLevelExpectationInDays:
                        row.serviceLevelExpectationInDays,
                }) as WorkItemTypeItem,
        );

        return workItemTypes;
    }
    async archiveWorkItemTypeMap(
        orgId: string,
        datasourceId: string,
        workItemTypeMapIds: string[],
    ): Promise<void> {
        const workItemTypeMapModel = WorkItemTypeMapModel(
            await this.database,
            Sequelize,
        );
        const where = {
            orgId,
            datasourceId,
            datasourceWorkItemId: workItemTypeMapIds,
        };
        await workItemTypeMapModel.update({ archived: true }, { where } as any);
    }
    async getWorkflowId(
        orgId: string,
        datasourceId: string,
        datasourceWorkItemTypeId: string,
        projectId?: string,
        issueTypeName?: string,
    ): Promise<string> {
        if (!orgId) throw new Error('getWorkflowId. Org id is mandatory');
        if (!datasourceId)
            throw new Error('getWorkflowId. Datasource id is mandatory');
        if (!datasourceWorkItemTypeId)
            throw new Error(
                'getWorkflowId. Datasource work item type value is mandatory',
            );

        const workItemTypeMapModel = WorkItemTypeMapModel(
            await this.database,
            Sequelize,
        );
        const datasourceWorkItemType = {
            [Op.and]: [
                sequelize.where(
                    sequelize.fn(
                        'lower',
                        sequelize.col('datasourceWorkItemId'),
                    ),
                    '=',
                    datasourceWorkItemTypeId.toLowerCase(),
                ),
            ],
        };
        let where: any = {
            orgId,
            datasourceId,
            // datasourceWorkItemId: datasourceWorkItemTypeId.toLowerCase(),
        };
        if (projectId && issueTypeName) {
            where['workflowId'] = slugify(
                `${orgId}.${projectId}.${issueTypeName}`,
            ).toLowerCase();
        }
        where = Object.assign(where, datasourceWorkItemType);
        const workItemTypeMapsDb: any = await workItemTypeMapModel.findOne({
            where: where,
        });

        let workflowId = '';
        if (workItemTypeMapsDb) {
            workflowId = workItemTypeMapsDb.get('workflowId') as string;
        }

        return workflowId;
    }
}
