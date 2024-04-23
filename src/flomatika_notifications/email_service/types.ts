import { string } from 'mathjs';

export interface EmailInfo {
    templateName: string;
    recipient: {
        email: string;
        name: string;
    };
};
// {{firstName}}
// {{obeyaName}}
// {{thresholdUnit}}
// {{thresholdType}}
// {{thresholdDate}}
// {{forecastWhen85%ile}}
// {{forecastWhen50%ile}}
// {{forecastWhen98%ile}}
// {{assumption1}}
// {{assumption2}}
// {{assumption3}}
// {{assumption4}}
export type ThresholdEmailParameters = {
    firstName: string;
    obeyaName: string;
    thresholdUnit: string;
    thresholdType: string;
    thresholdDate: string;
    thresholdDirection: string;
    forecastWhen50Percentile: string;
    forecastWhen85Percentile: string;
    forecastWhen98Percentile: string;
    assumption1: string;
    assumption2: string;
    assumption3: string;
    assumption4: string;
}
export type ThresholdNotificationEmailInfo = EmailInfo & {
    parameters: ThresholdEmailParameters;
};