import { DateTime } from 'luxon';
import { HistoryItem } from '../configuration/event_date_extractor';
import { RevisionTypes } from '../jiracloud/process/revision_processor';
import { getLastStatusChangeOfDay } from './process_revision_utils';
describe('getLastStatusChangeOfDay', () => {
    test('see if simple example works', () => {
        const today: DateTime = DateTime.fromISO(
            '2021-12-12T09:08:34.123+00:00',
        ).startOf('day');
        const tomorrowStartDay: DateTime = today.plus({ day: 1 });
        const tomorrowEndDay: DateTime = tomorrowStartDay
            .endOf('day')
            .minus({ minute: 10 });
        const revisions: Array<HistoryItem> = [
            {
                changedDate: today,
                statusId: 'arrival step',
                statusName: 'arrival step',
                revision: 'xxx1',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: tomorrowStartDay,
                statusId: 'commitment step 1',
                statusName: 'commitment step 1',
                revision: 'xxx2',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
            {
                changedDate: tomorrowEndDay,
                statusId: 'commitment step 2',
                statusName: 'commitment step 2',
                revision: 'xxx3',
                workItemId: 'abcd',
                type: RevisionTypes.STATE_CHANGE,
            },
        ];
        const validRevisions = getLastStatusChangeOfDay(revisions);
        expect(validRevisions.length).toBe(2);
        expect(validRevisions[0].revision).toBe('xxx1');
        expect(validRevisions[1].revision).toBe('xxx3');
    });
});
