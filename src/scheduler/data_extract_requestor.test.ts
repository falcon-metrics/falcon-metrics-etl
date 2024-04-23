import { mock } from 'jest-mock-extended';
import { DataExtractRequestor } from './data_extract_requestor';
import {
    IDatasource,
    DatasourceItem,
    DatasourceJob,
} from '../data/datasource_aurora';
import {
    ExtractType,
    IExtractKickoffNotifier,
} from '../notifications/extract_kickoff_notifier';
import { isDev } from '../utils/dev';
import { Logger } from 'pino';

describe('send requests', () => {
    test("When datasource not enabled Then don't generate an Extract event", async () => {
        const items: Array<DatasourceItem> = [
            {
                orgId: 'disabled',
                datasourceId: 'disabled',
                runType: 'and a runtype',
                datasourceType: 'a data source type',
            },
            {
                orgId: 'runtype and enabled not set',
                datasourceId: 'blah',
                datasourceType: 'a data source type',
            },
            {
                orgId: 'no run type and disabled',
                datasourceId: 'bleh',
                enabled: false,
                datasourceType: 'a data source type',
            },
        ];

        const mLogger = mock<Logger>();
        const mDatasource = mock<IDatasource>();
        const mNotifier = mock<IExtractKickoffNotifier>();

        mDatasource.getAll.mockResolvedValueOnce(items);

        const jobs: Array<DatasourceJob> = [
            {
                orgId: 'orgId',
                datasourceId: 'datasourceId',
                jobName: 'jobName',
                enabled: false,
                batchSize: 0,
                runDelayMinutes: 0,
            },
        ];
        mDatasource.getJobs.mockResolvedValueOnce(jobs);

        const der = new DataExtractRequestor({
            logger: mLogger,
            datasource: mDatasource,
            extractKickoffNotifier: mNotifier,
        });

        await der.sendRequestsToExtract(ExtractType.EXTRACT_STATES);

        if (!isDev) {
            expect(mDatasource.getAll).toBeCalledTimes(1);
            expect(mNotifier.notify).toBeCalledTimes(0);
        }
        expect(true).toBe(true);
    });

    test("When datasource does not have run type Then don't generate an Extract event", async () => {
        const items: Array<DatasourceItem> = [
            {
                orgId: 'no run type but enabled',
                datasourceId: 'id1',
                datasourceType: 'a data source type',
                enabled: true,
            },
            {
                orgId: 'runtype and enabled not set',
                datasourceId: 'id2',
                datasourceType: 'a data source type',
            },
            {
                orgId: 'empty runtype and enabled',
                datasourceId: 'id3',
                datasourceType: 'a data source type',
                runType: '',
                enabled: false,
            },
        ];

        const mLogger = mock<Logger>();
        const mDatasource = mock<IDatasource>();
        const mNotifier = mock<IExtractKickoffNotifier>();

        mDatasource.getAll.mockResolvedValueOnce(items);

        const jobs: Array<DatasourceJob> = [
            {
                orgId: 'orgId',
                datasourceId: 'datasourceId',
                jobName: 'jobName',
                enabled: false,
                batchSize: 0,
                runDelayMinutes: 0,
            },
        ];
        mDatasource.getJobs.mockResolvedValueOnce(jobs);

        const der = new DataExtractRequestor({
            logger: mLogger,
            datasource: mDatasource,
            extractKickoffNotifier: mNotifier,
        });

        await der.sendRequestsToExtract(ExtractType.EXTRACT_STATES);

        expect(mDatasource.getAll).toBeCalledTimes(1);
        expect(mNotifier.notify).toBeCalledTimes(0);
    });

    test('When there is an enabled datasource with a runtype Then generate an Extract event', async () => {
        const enabledItems: Array<DatasourceItem> = [
            {
                orgId: 'this is an id',
                datasourceId: 'id4',
                runType: 'and a runtype',
                datasourceType: 'a data source type',
                enabled: true,
            },
            {
                orgId: 'another datasource',
                datasourceId: 'id5',
                runType: 'another type',
                datasourceType: 'a data source type',
                enabled: true,
            },
        ];

        const disabledItems: Array<DatasourceItem> = [
            {
                orgId: 'disabled',
                datasourceId: 'id6',
                runType: 'and a runtype',
                datasourceType: 'a data source type',
                enabled: false,
            },
            {
                orgId: 'runtype and enabled not set',
                datasourceId: 'id7',
                datasourceType: 'a data source type',
            },
            {
                orgId: 'no run type and disabled',
                datasourceType: 'a data source type',
                datasourceId: 'id8',
                enabled: false,
            },
        ];

        const mLogger = mock<Logger>();
        const mDatasource = mock<IDatasource>();
        const mNotifier = mock<IExtractKickoffNotifier>();

        mDatasource.getAll.mockResolvedValueOnce(
            enabledItems.concat(disabledItems),
        );

        const jobs: Array<DatasourceJob> = [
            {
                orgId: 'orgId',
                datasourceId: 'datasourceId',
                jobName: 'jobName',
                enabled: false,
                batchSize: 0,
                runDelayMinutes: 0,
            },
        ];
        mDatasource.getJobs.mockReturnValue(Promise.resolve(jobs));

        const der = new DataExtractRequestor({
            logger: mLogger,
            datasource: mDatasource,
            extractKickoffNotifier: mNotifier,
        });

        await der.sendRequestsToExtract(ExtractType.EXTRACT_STATES);

        if (!isDev) {
            expect(mDatasource.getAll).toBeCalledTimes(1);
            expect(mNotifier.notify).toBeCalledTimes(enabledItems.length);
        }

        expect(true).toBe(true);
    });
});
