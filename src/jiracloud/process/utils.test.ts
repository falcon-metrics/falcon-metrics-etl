import _, { keys } from 'lodash';
import { DateTime } from 'luxon';
import { StandardSnapshotItem } from '../../workitem/interfaces';
import { RevisionTypes } from './revision_processor';
import { getFillersCount, PartialSnapshot, processFlaggedRevisions } from './utils';




const templateObj: StandardSnapshotItem = {
    partitionKey: 'partitionKey',
    flomatikaWorkItemTypeId: 'flomatikaWorkItemTypeId',
    flomatikaWorkItemTypeName: 'flomatikaWorkItemTypeName',
    flomatikaWorkItemTypeLevel: 'flomatikaWorkItemTypeLevel',
    workItemId: 'workItemId',
    title: 'title',
    workItemType: 'workItemType',
    state: 'state',
    stateCategory: 'stateCategory',
    stateType: 'stateType',
    stateOrder: 'stateOrder',
    assignedTo: 'assignedTo',
    customFields: [
        {
            datasourceFieldName: 'field1',
            datasourceFieldValue: 'value1',
            displayName: 'Field 1',
            type: 'string'
        },
        {
            datasourceFieldName: 'field2',
            datasourceFieldValue: 123,
            displayName: 'Field 2',
            type: 'number'
        }
    ],
    parentId: 'parentId',
    stepCategory: 'stepCategory',
    resolution: 'resolution',
    flomatikaSnapshotDate: 'flomatikaSnapshotDate',
    flomatikaCreatedBy: 'flomatikaCreatedBy',
    changedDate: 'changedDate',
    revision: 1,
    isFiller: true,
    createFillersCount: 0,
    previousRevision: 0,
    classOfServiceId: 'classOfServiceId',
    natureOfWorkId: 'natureOfWorkId',
    valueAreaId: 'valueAreaId',
    projectId: 'projectId',
    isDelayed: false,
    type: RevisionTypes.ASSIGNEE_CHANGE,
    assignee: 'newAssignee',
    blockedReason: 'blockReason',
    discardedReason: 'discardedReason',
    flagged: true
};


const snapshots1: StandardSnapshotItem[] = [
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },
    {
        flagged: true,
        stateType: '',
        type: RevisionTypes.FLAGGED,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: '',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },
    {
        flagged: false,
        stateType: '',
        type: RevisionTypes.FLAGGED,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        // 13
        flagged: true,
        stateType: 'queue',
        type: RevisionTypes.FLAGGED,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.DISCARDED_REASON,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },

    // 18
    {
        flagged: false,
        stateType: '',
        type: RevisionTypes.FLAGGED,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: true,
        stateType: '',
        type: RevisionTypes.FLAGGED,
    },
].map((r, i) => {
    let obj: any = { ...templateObj };
    Object.keys(templateObj).forEach(k => {
        obj[k] = `${obj[k]}_${i}`;
    });
    return { ...obj, ...r, revision: i };
});




const snapshots2: StandardSnapshotItem[] = [
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.BLOCKED_REASON,
    },
    // 5
    {
        flagged: true,
        stateType: '',
        type: RevisionTypes.FLAGGED,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: '',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.DISCARDED_REASON,
    },
    {
        flagged: false,
        stateType: 'queue',
        type: RevisionTypes.STATE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.ASSIGNEE_CHANGE,
    },
    {
        flagged: false,
        stateType: 'active',
        type: RevisionTypes.STATE_CHANGE,
    },
].map((r, i) => {
    let obj: any = { ...templateObj };
    Object.keys(templateObj).forEach(k => {
        obj[k] = `${obj[k]}_${i}`;
    });
    return { ...obj, ...r, revision: i };
});







describe('Test setFlaggedAndStateType', () => {
    const keysToPick = Object.keys(templateObj)
        .filter(k => !['flomatikaSnapshotDate', 'type', 'flagged', 'revision', 'createFillersCount', 'previousRevision', 'isFiller'].includes(k));
    test('Flagged revision has the same properties as the previous state change revision', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));

        expect(_.pick(transformedRevisions[4], keysToPick)).toMatchObject(_.pick(transformedRevisions[2], keysToPick));
    });

    test('Unflagged revision has the same properties as the previous state change revision', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));
        const unflaggedRevIdx = 9;
        expect(transformedRevisions[9].stateType).toBe(transformedRevisions[7].stateType);

        expect(_.pick(transformedRevisions[9], keysToPick)).toMatchObject(_.pick(transformedRevisions[7], keysToPick));
    });

    test('All revisions between flag and unflagged have flagged set as true', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));
        const flaggedRevIdx = 4;
        const unflaggedRevIdx = 9;
        const result = transformedRevisions.filter((r, i) => i > flaggedRevIdx && i < unflaggedRevIdx).every(r => r.flagged === true);
        expect(result).toBe(true);
    });


    test('Second flagged - Flagged revision has the same stateType as the previous state change revision', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));
        const flaggedRevIdx = 13;
        expect(transformedRevisions[flaggedRevIdx].stateType).toBe(transformedRevisions[flaggedRevIdx - 1].stateType);
    });

    test('Second flagged - Unflagged revision has the same stateType as the previous state change revision', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));
        const unflaggedRevIdx = 18;
        expect(transformedRevisions[unflaggedRevIdx].stateType).toBe(transformedRevisions[16].stateType);
    });

    test('Second flagged - All revisions between flag and unflagged have flagged set as true', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots1));
        const flaggedRevIdx = 13;
        const unflaggedRevIdx = 18;
        const result = transformedRevisions
            .filter((r, i) => i > flaggedRevIdx && i < unflaggedRevIdx)
            .every(r => r.flagged === true);
        expect(result).toBe(true);
    });

    test('All revision types remain unchanged', () => {
        const originalRevisions = _.cloneDeep(snapshots1);
        const transformedRevisions = processFlaggedRevisions(originalRevisions);
        const result = transformedRevisions.every(tr => originalRevisions.find(or => or.revision === tr.revision && or.type === tr.type));
        expect(result).toBe(true);
    });

    test('The flagged property of all flagged revisions remains unchanged', () => {
        const originalRevisions = _.cloneDeep(snapshots1);
        const transformedRevisions = processFlaggedRevisions(originalRevisions);
        const result = transformedRevisions
            .filter(r => r.type === RevisionTypes.FLAGGED)
            .every(tr => originalRevisions.find(or => or.revision === tr.revision && or.type === tr.type && or.flagged === tr.flagged));
        expect(result).toBe(true);
    });
});

describe('Test setFlaggedAndStateType when item flagged but not unflagged', () => {
    test('Flagged revision has the same stateType as the previous state change revision', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots2));
        expect(transformedRevisions[5].stateType).toBe(transformedRevisions[3].stateType);
    });
    test('All revisions after the flag revision have flagged set to true', () => {
        const transformedRevisions = processFlaggedRevisions(_.cloneDeep(snapshots2));
        const flaggedRevIdx = 5;
        const result = transformedRevisions.filter((r, i) => i >= flaggedRevIdx).every(r => r.flagged === true);
        expect(result).toBe(true);
    });
});


describe('Test setFlaggedAndStateType when there are no flagged revisions', () => {
    test('All revisions remain unchanged', () => {
        const originalRevisions = _.cloneDeep(snapshots1).filter(r => r.type !== RevisionTypes.FLAGGED);
        const transformedRevisions = processFlaggedRevisions(originalRevisions);
        const result = transformedRevisions
            .every(tr => originalRevisions.find(or => or.revision === tr.revision && or.type === tr.type && or.stateType === tr.stateType && or.flagged === tr.flagged) !== undefined);
        expect(result).toBe(true);
    });
});



describe('getFillersCount', () => {
    test('getFillersCount returns correct number of fillers', () => {
        // Create sample snapshots with Indian Standard Time timestamps
        const snapshots = [
            {
                type: RevisionTypes.STATE_CHANGE,
                changedDate: DateTime.fromISO('2022-01-01T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.BLOCKED_REASON,
                changedDate: DateTime.fromISO('2022-01-03T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.STATE_CHANGE,
                changedDate: DateTime.fromISO('2022-01-04T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.FLAGGED,
                changedDate: DateTime.fromISO('2022-01-08T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.BLOCKED_REASON,
                changedDate: DateTime.fromISO('2022-01-10T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.STATE_CHANGE,
                changedDate: DateTime.fromISO('2022-01-12T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.DISCARDED_REASON,
                changedDate: DateTime.fromISO('2022-01-20T00:00:00.000+05:30')
            },
            {
                type: RevisionTypes.STATE_CHANGE,
                changedDate: DateTime.fromISO('2022-01-25T00:00:00.000+05:30')
            },
        ];

        // Test the function with various indexes
        expect(getFillersCount(-1, snapshots)).toBe(0);
        expect(getFillersCount(0, snapshots)).toBe(3);
        expect(getFillersCount(2, snapshots)).toBe(4);

        // Discarded - zero fillers
        expect(getFillersCount(4, snapshots)).toBe(0);

        // Flagged revision
        expect(getFillersCount(3, snapshots)).toBe(4);
    });

});
