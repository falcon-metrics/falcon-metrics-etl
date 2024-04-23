import { NumberList } from 'aws-sdk/clients/iot';
import { DateTime } from 'luxon';
import { EventDates, HistoryItem } from '../configuration/event_date_extractor';
import { StateCategory } from '../data/state_category';
import { WorkflowStepKey } from '../data/work_item_type_aurora';
import { RawItem } from '../process_interfaces/revision_process_interface';

export const excludeItem = (
    flomatikaFields: RawItem['flomatikaFields'],
    eventDates: EventDates,
): boolean => {
    if (
        eventDates.departure &&
        flomatikaFields.excludeBeforeDate &&
        eventDates.departure.endOf('day') <
            DateTime.fromISO(flomatikaFields.excludeBeforeDate).endOf('day')
    ) {
        return true;
    }
    return false;
};

/**
 * @deprecated - We want to store all revisions of the day.
 * @param histories
 * @returns
 */
export const getLastStatusChangeOfDay = (
    histories: HistoryItem[],
): HistoryItem[] => {
    const statusChanges = histories.reduce((changes, currChange) => {
        const lastChange = changes[changes.length - 1];
        if (
            lastChange &&
            lastChange.changedDate.toISODate() ===
                currChange.changedDate.toISODate()
        ) {
            changes[changes.length - 1] = currChange;
        } else {
            changes.push(currChange);
        }
        return changes;
    }, new Array<HistoryItem>());
    return statusChanges;
};

export const isDelayedSnapshot = (eventDates: EventDates, revision: string) => {
    return eventDates.delayedRevision
        ? Number.parseInt(revision) >=
              Number.parseInt(eventDates.delayedRevision)
        : false;
};

export type EventPointOrders = {
    arrivalPointOrder: number;
    commitmentPointOrder: number;
    departurePointOrder: number;
};

export const calculateEventPointOrders = (
    arrivalPointStepKeys: WorkflowStepKey[],
    commitmentPointStepKeys: WorkflowStepKey[],
    departurePointStepKeys: WorkflowStepKey[],
): EventPointOrders => {
    const arrivalPointOrder = Math.min(
        ...arrivalPointStepKeys.map((p) => p.order!),
    );
    const commitmentPointOrder = Math.min(
        ...commitmentPointStepKeys.map((p) => p.order!),
    );
    const departurePointOrder = Math.min(
        ...departurePointStepKeys.map((p) => p.order!),
    );

    return {
        arrivalPointOrder,
        commitmentPointOrder,
        departurePointOrder,
    };
};

export const calculateStepCategory = (
    workflowStepOrder: number,
    eventPointOrders: EventPointOrders,
) => {
    /*
    WHEN (subquery."stateOrder" < subquery."arrivalPointOrder") THEN 'preceeding'
    WHEN (subquery."stateOrder" >= subquery."arrivalPointOrder" AND subquery."stateOrder" < subquery."commitmentPointOrder") THEN 'proposed'
    WHEN (subquery."stateOrder" >= subquery."commitmentPointOrder" AND subquery."stateOrder" < subquery."departurePointOrder") THEN 'inprogress'
    WHEN (subquery."stateOrder" >= subquery."departurePointOrder")  THEN 'completed'    
*/
    let stepCategory: string;

    if (workflowStepOrder < eventPointOrders.arrivalPointOrder) {
        stepCategory = StateCategory[StateCategory.PRECEDING].toLowerCase();
    } else if (
        workflowStepOrder >= eventPointOrders.arrivalPointOrder &&
        workflowStepOrder < eventPointOrders.commitmentPointOrder
    ) {
        stepCategory = StateCategory[StateCategory.PROPOSED].toLowerCase();
    } else if (
        workflowStepOrder >= eventPointOrders.commitmentPointOrder &&
        workflowStepOrder < eventPointOrders.departurePointOrder
    ) {
        stepCategory = StateCategory[StateCategory.INPROGRESS].toLowerCase();
    } else if (workflowStepOrder >= eventPointOrders.departurePointOrder) {
        stepCategory = StateCategory[StateCategory.COMPLETED].toLowerCase();
    } else {
        //default
        stepCategory = 'invalid';
    }

    return stepCategory;
};
