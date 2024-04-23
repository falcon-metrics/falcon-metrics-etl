import { Context as AWSContext } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import { asValue, asClass } from 'awilix';
import { Context } from '../data/context_aurora';
import { DatasourceSecret } from './datasource_secret';

export const datasourceSecretToken = async (
    event: any, // eslint-disable-line
    context: AWSContext,
): Promise<string | undefined> => {
    const container = await getDependencyInjectionContainer();

    const logger = container.cradle.logger;

    if (logger.isDebugEnabled()) logger.debug('Got event: %o', event);

    container.register({
        lambdaContext: asValue(context),
        context: asClass(Context),
    });

    try {
        logger.trace('Got message: %o', event);

        return await (
            container.cradle.datasourceSecret as DatasourceSecret
        ).getToken(event.orgId, event.datasourceId);
    } catch (e) {
        logger.error('Failed: ' + e.message + '\n' + e.stack);
        throw e;
    }
};
