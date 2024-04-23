import { SQS } from 'aws-sdk';
import { ContextItem } from '../data/context_aurora';
import { CustomFieldConfig } from '../data/custom_fields_config';
import { ServiceDetails, PrivateFields } from '../data/datasource_aurora';
import { ProjectItem } from '../data/project_aurora';
import { WorkItemTypeMapItem } from '../data/work_item_type_aurora';
import { RawItem } from './revision_process_interface';

export interface IExtractStateProcessor {
    //The configs to be feed into the query
    getContextConfigs(): Promise<Array<ContextItem>>;
    getProjectConfigs(): Promise<ProjectItem[]>;
    getWorkItemTypeConfigs(): Promise<WorkItemTypeMapItem[]>;
    getCustomFieldConfigs(): Promise<CustomFieldConfig[]>;
    getLinkedItemsConfigs(): any;
    getPrivateFieldsConfigs(): Promise<PrivateFields>;
    //The other necessary components to run extract
    getRunParameters(): Promise<ServiceDetails>;
    isExtractDue(runParameters: ServiceDetails): boolean;
    updateStateLastRun(runDate: string, lastChangedDate: string): Promise<void>;
    sortWorkItem(items: any[]): any[];
    checkIsTimeToQuit(
        startTimeMillis: number,
        runParameters: ServiceDetails,
    ): Promise<boolean>;
    //Get work items
    getWorkItemsFromDatasource(
        contextConfigs: ContextItem[],
        workItemTypeMaps: WorkItemTypeMapItem[],
        projects: ProjectItem[],
        runParameters: ServiceDetails,
        settingConfigs: PrivateFields,
        runDate: string,
        customFieldConfigs?: CustomFieldConfig[],
    ): Promise<any>;
    //Upload
    uploadWorkItemToS3(item: RawItem): Promise<string>;
    sendSQSMessage(itemKey: string): Promise<SQS.SendMessageResult>;
    //extract entry points
    extractState(startTimeMillis: number): Promise<void>;
    increaseBatchSizeWhenExtractFinished(
        countItemsUploadToS3: number,
        stateBatchSize: number,
    ): Promise<void>;
}
