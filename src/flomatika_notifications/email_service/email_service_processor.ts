import axios from 'axios';
import { Logger } from 'pino';
import {
    ThresholdEmailParameters,
    ThresholdNotificationEmailInfo,
} from './types';
export interface IEmailService {
    sendEmail(emailInfo: ThresholdNotificationEmailInfo): Promise<string>;
}

export class EmailService implements IEmailService {
    private logger: Logger;
    constructor(opt: { logger: Logger; }) {
        this.logger = opt.logger;
    }
    async sendEmail(
        emailInfo: ThresholdNotificationEmailInfo,
    ): Promise<string> {
        const messageBody = {
            key: process.env.MAILCHIMP_KEY,
            template_name: emailInfo.templateName,
            template_content: [
                {
                    name: 'template',
                    content: 'obeya-forecasting-date',
                },
            ],
            message: {
                to: [emailInfo.recipient],
                merge_language: 'handlebars',
                important: true,
                track_opens: true,
                track_clicks: true,
                inline_css: true,
                tags: ['Governance Obeya', 'Predictive Analysis', 'Date'],
                // global_merge_vars: [
                //     {
                //         name: 'forecastWhen50%ile',
                //         content: emailInfo.parameters['forecastWhen50%ile'],
                //     },
                // ],
                merge_vars: [
                    {
                        rcpt: emailInfo.recipient.email,
                        vars: Object.keys(emailInfo.parameters).map(
                            (parameterKey) => {
                                const key =
                                    parameterKey as keyof ThresholdEmailParameters;
                                return {
                                    name: key,
                                    content: emailInfo.parameters[key],
                                };
                            },
                        ),
                    },
                ],
            },
        };
        const url = `https://mandrillapp.com/api/1.0/messages/send-template?key=${process.env.MAILCHIMP_KEY}`;
        this.logger.info(
            `Sending ${messageBody.template_name} to ${messageBody.message.to[0].email}`,
        );
        try {
            await axios.post(url, messageBody);
            return 'okay';
        } catch (error) {
            throw Error(
                `Email sending error when sending ${messageBody.template_name}`,
            );
        }
    }
}
