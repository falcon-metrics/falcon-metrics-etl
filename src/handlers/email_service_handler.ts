import { asClass } from 'awilix';
import { SQSEvent, Context } from 'aws-lambda';
import { getDependencyInjectionContainer } from '../common/dependency_injection_container';
import {
    EmailService,
    IEmailService,
} from '../flomatika_notifications/email_service/email_service_processor';
import { ThresholdNotificationEmailInfo } from '../flomatika_notifications/email_service/types';

export const process = async (
    event: SQSEvent,
    _context: Context,
): Promise<string> => {
    const container = await getDependencyInjectionContainer();
    container.register({
        emailService: asClass(EmailService),
    });
    try {
        for (const record of event.Records) {
            const messageBody = JSON.parse(
                record.body,
            ) as ThresholdNotificationEmailInfo;
            await (container.cradle.emailService as IEmailService).sendEmail(
                messageBody,
            );
        }
        return 'ok';
    } catch (error) {
        container.cradle.logger.error('send email failed with error %o', error);
        return 'no';
    }
};
