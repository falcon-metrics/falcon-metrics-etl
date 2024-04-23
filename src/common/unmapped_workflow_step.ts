import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { Sequelize } from 'sequelize';
import { HistoryItem } from '../configuration/event_date_extractor';
import { WorkflowStepsModel } from '../data/models/WorkflowStepsModel';
import { Workflow, WorkflowStep } from '../data/work_item_type_aurora';
import { ItemStatus } from '../process_interfaces/revision_process_interface';
import { LogTags } from '../utils/log_tags';

export interface IUnmappedWorkflowStepProcessor {
    mapWorkflowStep(
        workflow: Workflow,
        unmappedStep: WorkflowStep,
    ): Promise<void>;

    /**
     * The method should do 2 things
     * - Compare the current status of the item with the workflow steps
     * to see if the current status of the item is an unmapped workflow step
     *
     * - Iterate over the revisions of the item and check
     * if the status of any of the revisions is an unmapped workflow step
     *
     *
     * ***Note:
     * Workflow steps is a project level configuration.
     * The workflow steps can be modified, deleted or
     * a new workflow step can be created***
     *
     * @param itemCurrentStatus Status id and status name of the item
     * @param revisions Revisions of the item
     * @param workflow Workflow for the type of the item in the project the item is in
     * @returns Unmapped workflow steps
     */
    getUnmappedWorkflowSteps(
        itemCurrentStatus: ItemStatus,
        revisions: HistoryItem[],
        workflow: Workflow,
    ): WorkflowStep[];
}

export type WorkflowStepItem = WorkflowStep & {
    orgId: string;
    datasourceId: string;
    createdAt: string;
    createdBy: string;
    order: number;
    stateType: string;
    workflowId: string;
};

export class UnmappedWorkflowStepProcessor
    implements IUnmappedWorkflowStepProcessor
{
    private orgId: string;
    private logger: Logger;
    private datasourceId: string;
    private database: Sequelize;

    constructor(opts: {
        orgId: string;
        logger: Logger;
        datasourceType: string;
        datasourceId: string;
        database: Sequelize;
    }) {
        this.orgId = opts.orgId;
        this.logger = opts.logger;
        this.datasourceId = opts.datasourceId;
        this.database = opts.database;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            datasourceId: this.datasourceId,
        });
    }
    async mapWorkflowStep(
        workflow: Workflow,
        unmappedStep: WorkflowStep,
    ): Promise<void> {
        const workflowStep = await this.createWorkflowStepWithStateCategory(
            workflow,
            unmappedStep,
        );
        workflow.workflowSteps?.push(workflowStep);
        await this.loadUnmappedWorkflowStep(workflowStep);
    }
    async createWorkflowStepWithStateCategory(
        workflow: Workflow,
        unmappedStep: WorkflowStep,
    ): Promise<WorkflowStepItem> {
        const step: WorkflowStepItem = {
            orgId: this.orgId,
            datasourceId: this.datasourceId,
            name: unmappedStep.name ?? unmappedStep.id,
            order: 9999, //All the unmapped will be 9999
            stateType: 'queue',
            createdAt: DateTime.utc().toISO(),
            createdBy: 'etl2',
            active: false,
            projectId: unmappedStep.projectId,
            workflowId: workflow.workflowId!,
            id: unmappedStep.id,
        };
        return step;
    }
    async loadUnmappedWorkflowStep(step: WorkflowStepItem): Promise<void> {
        const workflowStepsModel = WorkflowStepsModel(
            await this.database,
            Sequelize,
        );

        await workflowStepsModel.upsert(step);

        this.logger.info({
            message: 'Saved unmapped workflow step',
            step,
        });
    }
    private formatStateCategory(category: string | undefined): string {
        switch (category?.toLowerCase().replace(' ', '')) {
            case 'todo':
                return 'proposed';
            case 'inprogress':
                return 'inprogress';
            case 'done':
                return 'completed';
            case 'removed':
                return 'removed';
            // case 'yy':
            //     return 'YY';
            default:
                return 'completed';
        }
    }

    private getStateType(category: string): 'queue' | 'active' {
        const active = ['inprogress'];
        if (active.indexOf(category) > -1) return 'active';
        else return 'queue';
    }
    getUnmappedWorkflowSteps(
        itemCurrentStatus: ItemStatus,
        revisions: HistoryItem[],
        workflow: Workflow,
    ): WorkflowStep[] {
        /**
         * Utility function to check if either the given status id or status name is unmapped
         */
        const isUnmapped = (stepId: string, stepName: string): boolean => {
            const workflowStepIndex = workflow?.workflowSteps?.find(
                (step: WorkflowStep) => {
                    return step.id === stepId && step.name === stepName;
                },
            );
            // Why check workflow if it is never undefined? Not sure.
            // Leaving it here because the old code was written this way
            return workflow && !workflowStepIndex;
        };

        const unmappedWorkflowSteps: WorkflowStep[] = [];

        // Check the current status of the item.
        // See if the current status of the item is an unmapped workflow step
        // const { id: statusId, name: statusName } = item.flomatikaFields.;
        const { statusId, statusName } = itemCurrentStatus;
        const isCurrentStatusUnmapped = isUnmapped(statusId, statusName);
        if (isCurrentStatusUnmapped) {
            const unmappedWorkflowStep = {
                // workflowId: workflow.workflowId as string,
                workflowId: workflow.workflowId,
                id: statusId,
                name: statusName,
                orgId: this.orgId,
                projectId: workflow.projectId,
                // stateCategory is undefined, that's okay for now because its not being used anywhere
            };
            unmappedWorkflowSteps.push(unmappedWorkflowStep);
        }

        // Check revisions of the item
        // Iterate over revisions and check if any of the revisions is unmapped
        for (const element of revisions) {
            const currentRevision = element;
            const workflowStep = workflow?.workflowSteps?.find(
                (step: WorkflowStep) => {
                    return (
                        step.id === currentRevision.statusId &&
                        step.name === currentRevision.statusName
                    );
                },
            );
            if (workflow && !workflowStep) {
                const unmappedWorkflowStep = {
                    workflowId: workflow.workflowId,
                    id: currentRevision.statusId, //this is the step id
                    name: currentRevision.statusName,
                    orgId: this.orgId,
                    stateCategory: currentRevision.stateCategory,
                    projectId: workflow.projectId,
                };
                unmappedWorkflowSteps.push(unmappedWorkflowStep);
            }
        }
        return unmappedWorkflowSteps;
    }
}
