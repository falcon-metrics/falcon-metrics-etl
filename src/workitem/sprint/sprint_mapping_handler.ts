import { asClass, asValue, AwilixContainer, Lifetime } from 'awilix';
import { Context as LambdaContext, SQSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { DateTime } from 'luxon';
import { AbConfig } from '../../azureboards/data/ab_config';
import { ABRevision } from '../../azureboards/data/ab_revision';
import { ABWorkItem } from '../../azureboards/data/ab_work_item';
import { AzureBoardsSprintsProcessor } from '../../azureboards/process/extract_sprints_processor';
import { getDependencyInjectionContainer } from '../../common/dependency_injection_container';
import { Context } from '../../data/context_aurora';
import { Datasource } from '../../data/datasource_aurora';
import { Project } from '../../data/project_aurora';
import { JCConfig } from '../../jiracloud/data/jc_config';
import { JCIssue } from '../../jiracloud/data/jc_issue';
import { JCStatus } from '../../jiracloud/data/jc_status';
import { JiraSprintsProcessor } from '../../jiracloud/process/extract_sprints_processor';
import { SqsClient } from '../../notifications/sqs_client';
import { FlomatikaSprint, ISprintProcessor, SprintMetadataBase } from '../../process_interfaces/extract_sprints_process_interface';
import { SprintLoadProcessor } from './sprint_load_processor_aurora';


// TODO: Implement delete after implementing load
// export const deletePreviousWorkItemMapSprint = async (
//     event: SNSEvent,
//     sprint: Sprint,
// ): Promise<string> => {
// };
export type QueueItem = {
    sprint: FlomatikaSprint & {
        startDate: string | undefined;
        endDate: string | undefined;
        completedDate: string | undefined;
        flomatikaCreatedDate: string;
    },
    metadata: SprintMetadataBase;
};

const registerJiraExtractor = (container: AwilixContainer) => {
    container.register({
        processor: asClass(JiraSprintsProcessor),
        jcState: asClass(JCIssue),
        jcStatus: asClass(JCStatus),
        jcConfig: asClass(JCConfig),
    });
};
const registerAzureBoardsExtractor = (container: AwilixContainer) => {
    container.register({
        processor: asClass(AzureBoardsSprintsProcessor),
        abState: asClass(ABWorkItem),
        abConfig: asClass(AbConfig),
        abRevision: asClass(ABRevision),
        project: asClass(Project),
    });
};


export const mapWorkitemsToSprint = async (
    event: SQSEvent,
    context: LambdaContext,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();

    container.cradle.logger.trace('[AURORA] Got message: %o', event);

    container.register({
        sprintLoader: asClass(SprintLoadProcessor, { lifetime: Lifetime.SCOPED }),
    });


    const strToDate = (dateStr: string | undefined) => {
        if (!dateStr) return undefined;
        else return DateTime.fromISO(dateStr);
    };

    try {
        for (const eventRecord of event.Records) {
            const payload = eventRecord.body;
            const { sprint: flomatikaSprint, metadata }: QueueItem = JSON.parse(payload);
            container.register({
                orgId: asValue(flomatikaSprint.orgId),
                datasourceId: asValue(flomatikaSprint.datasourceId),
                lambdaSprint: asValue(context),
                datasourceType: asValue(metadata.datasourceType),
                context: asClass(Context),
                datasource: asClass(Datasource),
                sqsClient: asClass(SqsClient),
            });

            switch (metadata.datasourceType) {
                case 'jira-cloud':
                case 'jira-server':
                    registerJiraExtractor(container);
                    break;
                case 'azure-boards':
                    registerAzureBoardsExtractor(container);
                    break;
                default:
                    (container.cradle.logger as Logger).error(
                        `Invalid datasource type ${metadata.datasourceType} for extract processor`,
                    );
            }

            await (container.cradle.processor as ISprintProcessor).mapSprintsToWorkItems({
                ...flomatikaSprint,
                startDate: strToDate(flomatikaSprint.startDate),
                endDate: strToDate(flomatikaSprint.endDate),
                flomatikaCreatedDate: DateTime.fromISO(flomatikaSprint.flomatikaCreatedDate),
            }, metadata);
        }
    } catch (e) {
        container.cradle.logger.error(JSON.stringify({
            message: `Sprint-Work Item mapping failed`,
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
            sqsEvent: event,
        }));
        throw e;
    }

    return 'Sprint-Work Item mapping successful';
};