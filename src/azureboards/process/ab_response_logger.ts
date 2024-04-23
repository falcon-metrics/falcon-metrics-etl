import { Logger } from 'pino';

export interface IResponseLogger {
    log(result: any): void;
}

/**
 * @deprecated
 * 
 * Dont use this logger
 */
export class ADOResponseLogger {
    private logger: Logger;

    constructor(opts: { logger: Logger; }) {
        this.logger = opts.logger;
    }

    log(response: any): void {
        try {
            if ('@vsts.warnings' in response) {
                const warning: string = response['@vsts.warnings'].toString();

                //this is the 10 columns warning
                if (warning.includes('VS403509')) {
                    this.logger.debug('ADO: %o', warning);
                } else {
                    this.logger.warn('ADO: %o', warning);
                }
            }

            if ('error' in response) {
                this.logger.error('ADO [RESPONSE]: %o', response.error);
            }

            if ('status' in response) {
                this.logger.error(
                    'ADO [RESPONSE]: response status: %o',
                    response.status,
                );
            }
        } catch (e) {
            this.logger.error('ADO: unable to log error');
        }
    }
}
