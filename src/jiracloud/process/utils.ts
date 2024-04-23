import _ from "lodash";
import { DateTime } from "luxon";
import { StandardSnapshotItem } from "../../workitem/interfaces";
import { JiraHistoryItem, RevisionTypes } from "./revision_processor";


/**
 * Given the index of a flagged revision, give the index of corresponding
 * unflag revision. 
 * 
 * If the unflag revision is not return undefined
 */
const findUnflagRevisionIndex = (startIndex: number, revisions: StandardSnapshotItem[]): number | undefined => {
    for (let i = startIndex; i < revisions.length; i++) {
        if (revisions[i].type === RevisionTypes.FLAGGED && revisions[i].flagged === false) {
            return i;
        }
    }
    return undefined;
};


/**
 * This function mutates the objects in the given array. Given the index of the flagged revision
 * copy all properties from the previous STATE_CHANGE revision
 * 
 * @param flagRevisionIndex index of either the flag or unflag revision
 * @param allRevisions all revisions
 */
export const copyFieldsFromStateChangeRevision = (
    flagRevisionIndex: number,
    allRevisions: StandardSnapshotItem[]
) => {
    if (flagRevisionIndex < 0 || flagRevisionIndex >= allRevisions.length) {
        console.error('Index out of bounds in copyFieldsFromStateChangeRevision');
        return;
    }

    for (let i = flagRevisionIndex - 1; i >= 0; i--) {
        if (allRevisions[i].type === RevisionTypes.STATE_CHANGE) {
            const prevStateChangeRevision = allRevisions[i];
            const flaggedRevision = { ...allRevisions[flagRevisionIndex] };
            allRevisions[flagRevisionIndex] = {
                // Copy all the properties of the previous state change revision, except for some properties
                ...prevStateChangeRevision,
                type: RevisionTypes.FLAGGED,
                flagged: flaggedRevision.flagged,
                flomatikaSnapshotDate: flaggedRevision.flomatikaSnapshotDate,
                revision: flaggedRevision.revision,
                // This is a legacy property. We're not using fillers anymore
                createFillersCount: 0,
                previousRevision: flaggedRevision.previousRevision,
                isFiller: false,
            };
            break;
        }
    }
};

export const getFlaggedRevisionIndexes = (sortedRevisions: StandardSnapshotItem[]) => {
    return sortedRevisions
        .map((r, i) => ({ ...r, index: i }))
        .filter(r => r.type === RevisionTypes.FLAGGED && r.flagged === true)
        .map(r => r.index);
};


/**
 * - All revisions between flag and unflag must have flagged set to true
 * - The flag or unflag revision must have the same properties (except some, see the code) as the previous state change revision
 */
export const processFlaggedRevisions = (allRevisions: StandardSnapshotItem[]): StandardSnapshotItem[] => {
    // Sort the revisions by revision ID
    // Assume that you will not have items with duplicate (revision, stateType)
    const sortedRevisions = _.sortBy(allRevisions, r => r.revision);

    // Get indexes of all revision when the item got flagged
    const flaggedRevisionIndexes = getFlaggedRevisionIndexes(sortedRevisions);

    if (flaggedRevisionIndexes.length !== 0) {
        flaggedRevisionIndexes.forEach(flagRevisionIndex => {
            // Set the state type same as the previous state_change revision 
            if (flagRevisionIndex > 0) {
                copyFieldsFromStateChangeRevision(flagRevisionIndex, sortedRevisions);
            } else if (flagRevisionIndex === 0) {
                // If the first revision is flagged - This does not happen in Jira
                // TODO: Check if this can happen in azure boards
                // TODO: Write a test for this
                sortedRevisions[flagRevisionIndex].stateType = 'queue';
            }

            const unflagRevisionIndex = findUnflagRevisionIndex(flagRevisionIndex, sortedRevisions);

            // All the revisions between flag and unflag must have flagged set to true 
            // If there no unflagged revision, set flagged as true for all elements till the end

            let end = sortedRevisions.length;
            if (unflagRevisionIndex !== undefined && unflagRevisionIndex > 0) {
                // +1 here because the loop has i < end
                end = unflagRevisionIndex;
            }

            // If the flagged revision is the last revision, this loop does not run
            for (let i = flagRevisionIndex; i < end; i++) {
                sortedRevisions[i].flagged = true;
            }

            // If there is an unflag revision, set the state type of the unflag revision to the state type of the 
            // previous state change revision
            if (unflagRevisionIndex !== undefined && unflagRevisionIndex > 0) {
                copyFieldsFromStateChangeRevision(unflagRevisionIndex, sortedRevisions);
            }
        });
    }
    return sortedRevisions;
};


export interface PartialSnapshot {
    type: RevisionTypes;
    changedDate: DateTime;
    [key: string]: any;
}

/**
 * @deprecated 
 * 
 * We're not using fillers anymore
 * Utility function to get the count of fillers
 */
export const getFillersCount = (index: number, snapshots: PartialSnapshot[]): number => {
    const allowedTypes = [RevisionTypes.STATE_CHANGE, RevisionTypes.FLAGGED];

    // Checks
    if (snapshots.length === 0 || index < 0 || index > snapshots.length) {
        return 0;
    }

    const currentSnapshot = snapshots[index];
    // No fillers for revision types other than these
    if (allowedTypes.includes(currentSnapshot.type) === false) {
        return 0;
    }

    let fillersCount = 0;
    for (let i = index + 1; i < snapshots.length; i++) {
        if (allowedTypes.includes(snapshots[i].type)) {
            const nextSnapshotDate = snapshots[i].changedDate;
            // The number of fillers required is based on the difference in times of the revisions.
            // We need to add a filler every 24 hours
            // For more details and the change from existing logic,  see https://example.atlassian.net/browse/FLO-3536
            fillersCount = Math.floor(nextSnapshotDate.diff(currentSnapshot.changedDate, 'hours').hours / 24);
            break;
        }
    }
    return fillersCount;
};
