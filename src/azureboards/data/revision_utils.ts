import _ from "lodash";

export const getBlockedRevisions = (revisions: any[], blockedFieldName: string) => {
    const reductionFn = (accumList: any[], currentRevision: any) => {
        // If the list is empty, push the first revision
        if (accumList.length === 0) {
            if (blockedFieldName in currentRevision && currentRevision[blockedFieldName] !== null && currentRevision[blockedFieldName] !== 'No') {
                currentRevision.flagged = true;
                accumList.push(currentRevision);
            }
        } else {
            const previousRevision = _.last(accumList);
            // Push only if the previous state is not same as current state
            if (
                (previousRevision[blockedFieldName] !== currentRevision[blockedFieldName])

            ) {
                currentRevision.flagged = false;
                if (currentRevision[blockedFieldName] !== null && currentRevision[blockedFieldName] !== 'No') {
                    currentRevision.flagged = true;
                }
                accumList.push(currentRevision);
            }
        }
        return accumList;
    };

    const filteredRevisions = _.chain(revisions)
        .groupBy('WorkItemId')
        .map((allRevisionsOfItem, key) => {
            return _.chain(allRevisionsOfItem)
                .sortBy(['Revision'])
                .reduce(reductionFn, [])
                .value();
        })
        .flatten()
        .value();
    return filteredRevisions;
};

export const getAssigneeChangeRevisions = (revisions: any[]) => {
    const reductionFn = (accumList: any[], currentRevision: any) => {
        // If the list is empty, push the first revision
        if (accumList.length === 0) {
            accumList.push({ ...currentRevision, assignee: currentRevision.AssignedTo?.UserName });
        } else {
            const previousRevision = _.last(accumList);
            // Push only if the previous state is not same as current state
            if (
                previousRevision.AssignedTo?.UserName
                !== currentRevision.AssignedTo?.UserName
            ) {

                accumList.push({ ...currentRevision, assignee: currentRevision.AssignedTo?.UserName });
            }
        }
        return accumList;
    };

    const filteredRevisions = _.chain(revisions)
        .groupBy('WorkItemId')
        .map((allRevisionsOfItem, key) => {
            return _.chain(allRevisionsOfItem)
                .sortBy(['Revision'])
                .reduce(reductionFn, [])
                .value();
        })
        .flatten()
        .value();
    return filteredRevisions;
};

export const getStateChangeRevisions = (revisions: any[]) => {
    const reductionFn = (accumList: any[], currentRevision: any) => {
        // If the list is empty, push the first revision
        if (accumList.length === 0) {
            accumList.push(currentRevision);
        } else {
            const previousState = _.last(accumList);
            // Push only if the previous state is not same as current state
            if (previousState.State !== currentRevision.State) {
                accumList.push(currentRevision);
            }
        }
        return accumList;
    };

    //The raw Azure Boards Query is returning all revisions. We are interested in only the revisions of changes in state.

    // Using lodash to do the following steps
    // 1. Group revisions by the WorkItemId
    // 2. In every group, sort the revisions by revision ID.
    // 3. Keep only the first revision of the same state. Using array reduction for this
    //    (Azure returns more than one revision for the same state. We need only one of them.
    //     We have to pick the first one becuase that's the date on with the item first went into that state)
    const workItemRevisions = _.chain(revisions)
        .groupBy('WorkItemId')
        .map((allRevisionsOfItem, key) => {
            return _.chain(allRevisionsOfItem)
                .sortBy(['Revision'])
                .reduce(reductionFn, [])
                .value();
        })
        .flatten()
        .value();
    return workItemRevisions;
};

/**
 * Function to get revisions of blocked reason and discarded reason
 */
export const getCustomFieldRevisions = (revisions: any[], fieldName: string) => {
    const reductionFn = (accumList: any[], currentRevision: any) => {
        // If the list is empty, push the first revision
        if (accumList.length === 0) {
            if (fieldName in currentRevision && currentRevision[fieldName] !== null) {
                currentRevision.fieldValue = currentRevision[fieldName];
                accumList.push(currentRevision);
            }
        } else {
            const previousRevision = _.last(accumList);
            // Push only if the previous state is not same as current state
            if (
                (previousRevision[fieldName] !== currentRevision[fieldName]) &&
                (fieldName in currentRevision && currentRevision[fieldName] !== null)
            ) {
                currentRevision.fieldValue = currentRevision[fieldName];
                accumList.push(currentRevision);
            }
        }
        return accumList;
    };

    const filteredRevisions = _.chain(revisions)
        .groupBy('WorkItemId')
        .map((allRevisionsOfItem, key) => {
            return _.chain(allRevisionsOfItem)
                .sortBy(['Revision'])
                .reduce(reductionFn, [])
                .value();
        })
        .flatten()
        .value();
    return filteredRevisions;
};