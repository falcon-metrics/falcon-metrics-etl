import {
    createContainer,
    asValue,
    asClass,
    AwilixContainer,
    Lifetime,
    asFunction,
} from 'awilix';
import pino, { Logger } from 'pino';
import { Datasource } from '../data/datasource_aurora';
import { DatasourceSecret } from '../secrets/datasource_secret';
import { AuroraSecret } from '../secrets/aurora_secret';
import { FieldMap } from '../data/field_map_aurora';
import { Context as AWSContext, SNSEvent, SQSEvent } from 'aws-lambda';
import { ABQuery } from '../azureboards/data/ab_query';
import { database as db } from '../workitem/sequelize';
import { CustomFieldConfigs } from '../data/custom_fields_config';

const logger = pino({
    mixin: (_context, level) => {
        return { 'level-label': logger.levels.labels[level] };
    },
}) as Logger;
const container = createContainer();
export const getDependencyInjectionContainer = async (
    event?: SNSEvent | SQSEvent,
    context?: AWSContext,
) => {
    container.register({
        auroraSecret: asClass(AuroraSecret, { lifetime: Lifetime.SCOPED }),
    });

    // If context is passed, use it to set the requestId
    // If we use instrumentation libraries, like open telemetry, this will be done automatically,
    const child = context
        ? logger.child({ awsRequestId: context.awsRequestId })
        : undefined;
    container.register({ logger: asValue(child ?? logger) });

    const database = async ({
        auroraSecret,
    }: {
        auroraSecret: AuroraSecret;
    }) => {
        const auroraHost = await auroraSecret.getHost();
        const auroraPassword = await auroraSecret.getPassword();
        if (!auroraHost || !auroraPassword)
            throw Error('Cannot find db host or password');
        const aurora = db(auroraHost!, auroraPassword!);
        return aurora;
    };

    container.register({
        database: asFunction(database, { lifetime: Lifetime.SCOPED }),
    });

    configureData(container);

    if (event) configureItemsFromPayload(event, container);

    return container;
};

const configureItemsFromPayload = (
    event: SNSEvent | SQSEvent,
    container: AwilixContainer<any>,
) => {
    if (!event.Records || !event.Records.length) {
        //if it's a pure scheduled event (just triggering something)
        //then there might not be a message body
        return;
    }
    if ((event as SNSEvent).Records[0]?.Sns) {
        const messagePayload = JSON.parse(
            (event as SNSEvent).Records[0].Sns.Message,
        );
        const { orgId, datasourceId, datasourceType } = messagePayload;
        container.register({
            orgId: asValue(orgId),
            datasourceId: asValue(datasourceId),
            datasourceType: asValue(datasourceType),
            logger: asValue(
                logger.child({ orgId, datasourceId, datasourceType }),
            ),
        });
    }
};

const configureData = (container: AwilixContainer<any>) => {
    container.register({
        datasource: asClass(Datasource, { lifetime: Lifetime.SCOPED }),
        fieldMap: asClass(FieldMap, { lifetime: Lifetime.SCOPED }),
        datasourceSecret: asClass(DatasourceSecret, {
            lifetime: Lifetime.SCOPED,
        }),
        auroraSecret: asClass(AuroraSecret, { lifetime: Lifetime.SCOPED }),
        abQuery: asClass(ABQuery, { lifetime: Lifetime.SCOPED }),
        customFieldConfig: asClass(CustomFieldConfigs, {
            lifetime: Lifetime.SCOPED,
        }),
    });
};
