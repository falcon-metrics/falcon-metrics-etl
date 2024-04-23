import { asClass, AwilixContainer, Lifetime } from 'awilix';
import { Context as AWSContext, SNSEvent } from 'aws-lambda';
import { Logger } from 'pino';
import { AbConfig } from '../azureboards/data/ab_config';
import { ABRevision } from '../azureboards/data/ab_revision';
import { ABWorkItem } from '../azureboards/data/ab_work_item';
import { AzureBoardsSprintsProcessor } from '../azureboards/process/extract_sprints_processor';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { Context } from '../data/context_aurora';
import { Datasource } from '../data/datasource_aurora';
import { Project } from '../data/project_aurora';
import { JCConfig } from '../jiracloud/data/jc_config';
import { JCIssue } from '../jiracloud/data/jc_issue';
import { JCStatus } from '../jiracloud/data/jc_status';
import { JiraSprintsProcessor } from '../jiracloud/process/extract_sprints_processor';
import { SqsClient } from '../notifications/sqs_client';
import { ISprintProcessor } from '../process_interfaces/extract_sprints_process_interface';
import { SprintLoadProcessor } from '../workitem/sprint/sprint_load_processor_aurora';

const registerJiraExtractor = (container: AwilixContainer) => {
    container.register({
        jcState: asClass(JCIssue),
        jcStatus: asClass(JCStatus),
        jcConfig: asClass(JCConfig),
        extractProcessor: asClass(JiraSprintsProcessor),
        sqsClient: asClass(SqsClient),
    });
};

const registerAzureBoardsExtractor = (container: AwilixContainer) => {
    container.register({
        abState: asClass(ABWorkItem),
        abConfig: asClass(AbConfig),
        abRevision: asClass(ABRevision),
        extractProcessor: asClass(AzureBoardsSprintsProcessor),
        sqsClient: asClass(SqsClient),
        project: asClass(Project),
    });
};

export const process = async (event: SNSEvent, context: AWSContext) => {
    const container = await getDependencyInjectionContainer(event);

    container.cradle.logger.trace('Got message: %o', event);

    // TODO: Move registration to dependency injection file
    container.register({
        context: asClass(Context),
        datasource: asClass(Datasource),
        sprintLoader: asClass(SprintLoadProcessor, {
            lifetime: Lifetime.SCOPED,
        }),
    });
    const datasourceType = container.cradle.datasourceType as string;

    switch (datasourceType) {
        case 'jira-cloud':
        case 'jira-server':
            registerJiraExtractor(container);
            break;
        case 'azure-boards':
            registerAzureBoardsExtractor(container);
            break;
        default:
            (container.cradle.logger as Logger).error(
                `Invalid datasource type ${datasourceType} for extract processor`,
            );
    }

    try {
        await (container.cradle.extractProcessor as ISprintProcessor).process();
    } catch (e: unknown) {
        container.cradle.logger.error('Error in sprints handler: %o', event);
        throw e;
    }

    return 'got it!';
};
