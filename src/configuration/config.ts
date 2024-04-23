import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { Sequelize } from 'sequelize';
import { IUnmappedWorkflowStepProcessor } from '../common/unmapped_workflow_step';
import { ContextItem, IContext } from '../data/context_aurora';
import {
    CustomFieldConfig,
    ICustomFieldConfigs,
} from '../data/custom_fields_config';
import {
    DatasourceItem,
    IDatasource,
    PrivateFields,
    ServiceDetails,
} from '../data/datasource_aurora';
import { IProject, ProjectItem } from '../data/project_aurora';
import {
    IWorkItemTypeMap,
    Workflow,
    WorkflowItem,
    WorkflowStep,
    WorkItemTypeItem,
    WorkItemTypeMapItem,
} from '../data/work_item_type_aurora';
import {
    ItemStatus,
    RawItem,
} from '../process_interfaces/revision_process_interface';
import { HistoryItem } from './event_date_extractor';
import { isDev } from '../utils/dev';

/**
 * Factory to create the Config class. Config class holds all
 * the configs saved from the wizard
 */
export class ConfigFactory {
    private orgId: string;
    private datasourceId: string;
    private datasource: IDatasource;
    private project: IProject;
    private workItemTypeMap: IWorkItemTypeMap;
    private context: IContext;
    private customFieldConfig: ICustomFieldConfigs;
    private sequelize: Promise<Sequelize>;
    private unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;

    constructor(opts: {
        orgId: string;
        datasourceId: string;
        logger: Logger;
        datasource: IDatasource;
        context: IContext;
        workItemTypeMap: IWorkItemTypeMap;
        project: IProject;
        database: any;
        customFieldConfig: ICustomFieldConfigs;
        unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
    }) {
        this.datasourceId = opts.datasourceId;
        this.datasource = opts.datasource;
        this.project = opts.project;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.context = opts.context;
        this.customFieldConfig = opts.customFieldConfig;
        this.orgId = opts.orgId;
        this.unmappedWorkflowStep = opts.unmappedWorkflowStep;
        if (this.orgId === undefined) {
            throw new Error('orgId is undefined');
        }
        this.sequelize = opts.database;
    }

    async getContextConfigs(): Promise<Array<ContextItem>> {
        const contexts = (
            await this.context.getContextsForOrgDataSource(
                this.orgId,
                this.datasourceId,
            )
        ).filter((context) => context.contextAddress);
        return contexts;
    }
    async getProjectConfigs(): Promise<ProjectItem[]> {
        const projects = await this.project.getAllProjects(
            this.orgId,
            this.datasourceId,
        );
        return projects;
    }
    async getPrivateFieldsConfigs(): Promise<PrivateFields> {
        let privateFields = await this.datasource.getSettings(this.orgId);
        if (!privateFields) {
            privateFields = {
                ingestAssignee: false,
                ingestTitle: false,
                orgId: this.orgId,
            };
        }
        return privateFields;
    }
    async getWorkItemTypeMaps(): Promise<WorkItemTypeMapItem[]> {
        const workItemTypeMaps = await this.workItemTypeMap.getWorkItemTypeMaps(
            this.orgId,
            this.datasourceId,
        );
        return workItemTypeMaps;
    }
    async getWorkItemTypes(): Promise<WorkItemTypeItem[]> {
        const workItemTypes = await this.workItemTypeMap.getWorkItemTypes(
            this.orgId,
            this.datasourceId,
        );
        return workItemTypes;
    }
    async getWorkflows(): Promise<Workflow[]> {
        const workflows = await this.workItemTypeMap.getWorkflows(
            this.orgId,
            this.datasourceId,
        );
        return workflows;
    }
    async getCustomFieldConfigs(
        projectId?: string,
    ): Promise<CustomFieldConfig[]> {
        return await this.customFieldConfig.getCustomFieldConfigs(
            this.orgId,
            this.datasourceId,
            projectId,
        );
    }
    async getRunParameters(): Promise<ServiceDetails> {
        const runParameters = await this.datasource.getServiceDetails(
            this.orgId,
            this.datasourceId,
        );
        if (!runParameters)
            throw new Error('I could not find any datasource parameters');

        return runParameters;
    }

    async create(): Promise<Config> {
        const [
            serviceDetails,
            datasource,
            projects,
            workItemTypeMaps,
            workItemTypes,
            contexts,
            privateFields,
            customFieldConfigs,
            workflows,
            sequelize,
        ] = await Promise.all([
            this.getRunParameters(),
            this.datasource.getDatasource(this.orgId, this.datasourceId),
            this.getProjectConfigs(),
            this.getWorkItemTypeMaps(),
            this.getWorkItemTypes(),
            this.getContextConfigs(),
            this.getPrivateFieldsConfigs(),
            this.getCustomFieldConfigs(),
            this.getWorkflows(),
            this.sequelize,
        ]);

        return new Config({
            orgId: this.orgId,
            serviceDetails,
            datasource: datasource as any,
            projects,
            workItemTypeMaps,
            contexts: contexts as any,
            privateFields,
            customFieldConfigs,
            workItemTypes,
            workflows,
            sequelize,
            unmappedWorkflowStep: this.unmappedWorkflowStep,
            workItemTypeMap: this.workItemTypeMap,
            datasourceClass: this.datasource,
        });
    }
}

export class Config {
    readonly orgId: string;
    readonly serviceDetails: ServiceDetails;
    readonly datasource: Required<DatasourceItem>;
    readonly projects: Required<ProjectItem>[];
    readonly contexts: Required<ContextItem>[];
    readonly privateFields: PrivateFields;
    readonly workItemTypeMaps: WorkItemTypeMapItem[];
    readonly workItemTypes: WorkItemTypeItem[];
    private _workflows: Required<Workflow>[];
    readonly customFieldConfigs: CustomFieldConfig[];
    readonly unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
    private workItemTypeMap: IWorkItemTypeMap;
    readonly sequelize: Sequelize;
    private readonly datasourceClass: IDatasource;

    constructor(opts: {
        orgId: string;
        serviceDetails: ServiceDetails;
        datasource: Required<DatasourceItem>;
        projects: Required<ProjectItem>[];
        contexts: Required<ContextItem>[];
        privateFields: PrivateFields;
        workItemTypeMaps: WorkItemTypeMapItem[];
        workItemTypes: WorkItemTypeItem[];
        workflows: Workflow[];
        customFieldConfigs: CustomFieldConfig[];
        unmappedWorkflowStep: IUnmappedWorkflowStepProcessor;
        workItemTypeMap: IWorkItemTypeMap;
        sequelize: Sequelize;
        datasourceClass: IDatasource;
    }) {
        this.orgId = opts.orgId;
        this.serviceDetails = opts.serviceDetails;
        this.datasource = opts.datasource;
        this.projects = opts.projects;
        this.contexts = opts.contexts;
        this.privateFields = opts.privateFields;
        this.workItemTypeMaps = opts.workItemTypeMaps;
        this.workItemTypes = opts.workItemTypes;
        this._workflows = opts.workflows as Required<Workflow>[];
        this.customFieldConfigs = opts.customFieldConfigs;
        this.unmappedWorkflowStep = opts.unmappedWorkflowStep;
        this.workItemTypeMap = opts.workItemTypeMap;
        this.sequelize = opts.sequelize;
        this.datasourceClass = opts.datasourceClass;
    }

    get datasourceId(): string {
        return this.datasource.datasourceId;
    }

    get datasourceType() {
        return this.datasource.datasourceType;
    }

    get workflows() {
        return this._workflows;
    }
    isExtractDue(): boolean {
        if (isDev) return true;

        return this.serviceDetails.isStateExtractDue;
    }

    nextRunStartFrom(): DateTime {
        let nextRunStartFrom = DateTime.fromMillis(0);

        const nextRunStartFromStr = this.serviceDetails.nextRunStartFrom;
        if (
            nextRunStartFromStr !== undefined &&
            DateTime.fromISO(nextRunStartFromStr).isValid
        ) {
            nextRunStartFrom = DateTime.fromISO(nextRunStartFromStr);
        }

        return nextRunStartFrom;
    }

    getUnmappedWorkflowSteps(
        itemCurrentStatus: ItemStatus,
        revisions: HistoryItem[],
        workflow: Workflow,
    ): WorkflowStep[] {
        return this.unmappedWorkflowStep.getUnmappedWorkflowSteps(
            itemCurrentStatus,
            revisions,
            workflow,
        );
    }

    async mapWorkflowStep(
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): Promise<void> {
        //get the statusCategory name
        //send to loader
        await this.unmappedWorkflowStep.mapWorkflowStep(workflow, workflowStep);

        // Reload workflows when a workflow step is added
        const workflows = await this.workItemTypeMap.getWorkflows(
            this.orgId,
            this.datasource.datasourceId,
        );
        this._workflows = workflows as Required<Workflow>[];
    }

    async updateStateLastRun(runDate: DateTime, nextStartFrom: DateTime) {
        return this.datasourceClass.updateStateLastRun(
            this.orgId,
            this.datasourceId,
            runDate.toISO()!,
            nextStartFrom.toISO()!,
        );
    }
}
