import { Logger } from 'pino';
import fetch, { Response } from 'node-fetch';
import btoa from 'btoa';

export interface IJCStatus {
    getAll(
        serviceUrl: string,
        accessToken: string,
    ): Promise<Map<string, { name: string; category: string; }>>;
}

export type StatusMap = Map<string, { name: string; category: string; }>;

export class JCStatus implements IJCStatus {
    private logger: Logger;


    constructor(opts: any) {
        this.logger = opts.logger;
        this.logger = opts.logger;
    }

    async getAll(serviceUrl: string, accessToken: string): Promise<StatusMap> {
        try {
            const fullUrl = `${serviceUrl}/status`;

            const response = await fetch(fullUrl, {
                headers: this.setupHeaders(accessToken),
            });

            if (!response.ok) throw response;

            const result = await response.json();

            const statuses = new Map<
                string,
                { name: string; category: string; }
            >();

            if (!result || !Array.isArray(result)) return statuses;

            for (const jcStatus of result) {
                statuses.set(jcStatus.id, {
                    name: jcStatus.name,
                    category: jcStatus.statusCategory.name,
                });
            }

            return statuses;
        } catch (e) {
            const responseText = await e.text();

            this.logger.error({
                message: 'Error fetching status',
                errorMessage: e.message,
                errorStack: e.stack,
                headers: e.headers,
                responseText
            });

            if (!e.statusText) throw e;

            const response = e as Response;

            this.logger.error({
                message: 'Error fetching status',
                responseText,
                headers: e.headers,
            });
            throw new Error(response.statusText);
        }
    }

    private setupHeaders(accessCredentials: string) {
        return {
            Authorization: 'Basic '.concat(btoa(accessCredentials)),
        };
    }
}
