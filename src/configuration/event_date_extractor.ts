import { DateTime } from 'luxon';
import {
    calculateEventPointOrders,
    calculateStepCategory,
} from '../common/process_revision_utils';

import {
    IsSameWorkflowStepKey,
    Workflow,
    WorkflowStepKey,
    WorkflowStep,
} from '../data/work_item_type_aurora';
import { RevisionTypes } from '../jiracloud/process/revision_processor';
export interface HistoryItem {
    changedDate: DateTime;
    statusId: string; //workflow step id
    statusName?: string;
    stateCategory?: string;
    revision?: string;
    workItemId?: string;
    type: RevisionTypes;
    assignee?: string;
    blockedReason?: string;
    discardedReason?: string;
    flagged?: boolean;
}

export type EventDates = {
    arrival?: DateTime;
    commitment?: DateTime;
    departure?: DateTime;
    isDelayed?: boolean;
    delayedRevision?: string;
    stepCategory?: string;

    arrivalPointOrder?: number;
    commitmentPointOrder?: number;
    departurePointOrder?: number;
};
export interface IEventDateExtractor {
    getEventDatesFromHistory(
        revisions: HistoryItem[],
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): EventDates;
}

export class EventDateExtractor implements IEventDateExtractor {
    private getBeforeArrivalPointStepKeys(
        workflow: Workflow,
    ): WorkflowStepKey[] {
        const beforeArrivalPoint: WorkflowStepKey[] = [];

        for (const step of workflow.workflowSteps!) {
            if (step.order! < workflow!.workflowEvents!.arrivalPointOrder!) {
                beforeArrivalPoint.push({
                    id: step.id,
                    name: step.name,
                    order: step.order,
                });
            }
        }
        return beforeArrivalPoint;
    }

    private getArrivalPointStepKeys(workflow: Workflow): WorkflowStepKey[] {
        const arrivalPointIds: WorkflowStepKey[] = [];

        for (const step of workflow.workflowSteps!) {
            if (
                step.order! >= workflow!.workflowEvents!.arrivalPointOrder! &&
                step.order! < workflow!.workflowEvents!.commitmentPointOrder!
            ) {
                arrivalPointIds.push({
                    id: step.id,
                    name: step.name,
                    order: step.order,
                });
            }
        }
        return arrivalPointIds;
    }

    private getCommitmentPointStepKeys(workflow: Workflow): WorkflowStepKey[] {
        const commitmentPointIds: WorkflowStepKey[] = [];

        for (const step of workflow.workflowSteps!) {
            if (
                step.order! >=
                    workflow!.workflowEvents!.commitmentPointOrder! &&
                step.order! < workflow!.workflowEvents!.departurePointOrder!
            ) {
                commitmentPointIds.push({
                    id: step.id,
                    name: step.name,
                    order: step.order,
                });
            }
        }
        return commitmentPointIds;
    }

    private getDeparturePointStepKeys(workflow: Workflow): WorkflowStepKey[] {
        const departurePointIds: WorkflowStepKey[] = [];
        for (const step of workflow.workflowSteps!) {
            if (step.order! >= workflow!.workflowEvents!.departurePointOrder!) {
                departurePointIds.push({
                    id: step.id,
                    name: step.name,
                    order: step.order,
                });
            }
        }
        return departurePointIds;
    }

    getEventDatesFromHistory(
        revisions: HistoryItem[],
        workflow: Workflow,
        workflowStep: WorkflowStep,
    ): EventDates {
        const eventDates: EventDates = {
            isDelayed: false,
        };

        /*
            algorithm:

            arrival = always use the first date from arrivalPointIds

            commitment = use the first date from commitmentPointIds
                  except: if later state after this one is an arrival point,
                            AND date of that later one is same as this one, then ignore this commitment point

            departure = use the first date from departurePointIds,
                  except: if any state after this is commitment or arrival point,
                            THEN ignore this departure point

            isDelayed = if the item goes from commitment back to proposed on a later date,
                        THEN it is a delayed item
         */
        //Map the changed date to date if it is not
        revisions.forEach((revision) => {
            if (!(revision.changedDate instanceof DateTime)) {
                revision.changedDate = DateTime.fromISO(revision.changedDate);
            }
        });

        revisions.sort(
            (
                a,
                b, //ascending order
            ) => a.changedDate.toMillis() - b.changedDate.toMillis(),
        );
        if (!workflow) {
            return eventDates;
        }
        //identify items that have gone in progress and back to proposed
        //if the state has a commitment point id and later arrival point id, it's gone back·
        const beforeArrivalPointStepKeys =
            this.getBeforeArrivalPointStepKeys(workflow);
        const arrivalPointStepKeys = this.getArrivalPointStepKeys(workflow);
        const commitmentPointStepKeys =
            this.getCommitmentPointStepKeys(workflow);
        const departurePointStepKeys = this.getDeparturePointStepKeys(workflow);

        const eventPointOrders = calculateEventPointOrders(
            arrivalPointStepKeys,
            commitmentPointStepKeys,
            departurePointStepKeys,
        );
        const stepCategory = calculateStepCategory(
            workflowStep.order!,
            eventPointOrders,
        );

        eventDates.stepCategory = stepCategory;
        eventDates.arrivalPointOrder = eventPointOrders.arrivalPointOrder;
        eventDates.commitmentPointOrder = eventPointOrders.commitmentPointOrder;
        eventDates.departurePointOrder = eventPointOrders.departurePointOrder;

        for (let i = 0; i < revisions.length; i++) {
            const currentRevision = revisions[i];
            const currentRevisionStepKey: WorkflowStepKey = {
                id: currentRevision.statusId,
                name: currentRevision.statusName,
            };
            if (
                //if this revision is an before arrvial step
                beforeArrivalPointStepKeys.some((p) =>
                    IsSameWorkflowStepKey(p, currentRevisionStepKey),
                )
            ) {
                if (
                    eventDates.arrival &&
                    !eventDates.commitment &&
                    !eventDates.departure
                ) {
                    eventDates.arrival = undefined;
                }
            }

            if (
                //if this revision is an arrival step
                !eventDates.arrival &&
                arrivalPointStepKeys.some((p) =>
                    IsSameWorkflowStepKey(p, currentRevisionStepKey),
                )
            ) {
                eventDates.arrival = currentRevision.changedDate;
            }

            if (
                //if this revision is a commitment step
                !eventDates.commitment &&
                commitmentPointStepKeys.some((p) =>
                    IsSameWorkflowStepKey(p, currentRevisionStepKey),
                )
            ) {
                let ignoreSameDayDelay = false;
                let isDelayed = false;
                let delayedRevision;

                //ignore commitment points that go back to arrival on the same day
                for (let j = i + 1; j < revisions.length; j++) {
                    const futureRevision = revisions[j];
                    const futureRevisionStepKey: WorkflowStepKey = {
                        id: futureRevision.statusId,
                        name: futureRevision.statusName,
                    };

                    //if the future revision is an arrival step or before arrival step
                    if (
                        arrivalPointStepKeys.some((p) =>
                            IsSameWorkflowStepKey(p, futureRevisionStepKey),
                        ) ||
                        beforeArrivalPointStepKeys.some((p) =>
                            IsSameWorkflowStepKey(p, futureRevisionStepKey),
                        )
                    ) {
                        //if there is a future arrival step that is not today, then it's been delayed
                        if (
                            !futureRevision.changedDate.hasSame(
                                currentRevision.changedDate,
                                'day',
                            )
                        ) {
                            isDelayed = true;
                            delayedRevision = futureRevision.revision;
                        } else {
                            // Reset isDelayed to false
                            isDelayed = false;
                        }

                        if (
                            !ignoreSameDayDelay &&
                            futureRevision.changedDate.hasSame(
                                currentRevision.changedDate,
                                'day',
                            )
                        ) {
                            //ignore if there's a future arrival point on the same day
                            ignoreSameDayDelay = true;

                            //allow the loop to continue because we're still looking for delayed items too
                        }
                    } else {
                        // Reset isDelayed to false
                        isDelayed = false;
                    }
                }

                // Set isDelayed as false by default
                // This is to make sure the item is not set as delayed forever,
                // isDelayed should be reset to false if the item is not delayed anymore
                // isDelayed should be set as true only if the time is delayed at the time of extract
                eventDates.isDelayed = false;

                if (!ignoreSameDayDelay) {
                    eventDates.commitment = currentRevision.changedDate;
                    if (isDelayed) {
                        eventDates.isDelayed = true;
                        eventDates.delayedRevision = delayedRevision;
                    }
                }
            }

            if (
                //if this revision is a departure step
                !eventDates.departure &&
                departurePointStepKeys.some((p) =>
                    IsSameWorkflowStepKey(p, currentRevisionStepKey),
                )
            ) {
                let ignore = false;

                for (let j = i + 1; j < revisions.length; j++) {
                    const futureRevision = revisions[j];
                    const futureRevisionStepKey: WorkflowStepKey = {
                        id: futureRevision.statusId,
                        name: futureRevision.statusName,
                    };

                    if (
                        arrivalPointStepKeys.some((p) =>
                            IsSameWorkflowStepKey(p, futureRevisionStepKey),
                        ) ||
                        commitmentPointStepKeys.some((p) =>
                            IsSameWorkflowStepKey(p, futureRevisionStepKey),
                        ) ||
                        beforeArrivalPointStepKeys.some((p) =>
                            IsSameWorkflowStepKey(p, futureRevisionStepKey),
                        )
                    ) {
                        ignore = true;
                    }
                }

                if (!ignore) {
                    eventDates.departure = currentRevision.changedDate;
                }
            }
        }
        if (!eventDates) {
            throw Error(
                `[REVISION][EVENT DATES]:workflow: ${JSON.stringify(
                    workflow,
                )} did not produced correct event dates`,
            );
        }
        //if departure or commitment, but no arrival, then arrival becomes commitment or departure date
        if (
            eventDates &&
            (eventDates.departure || eventDates.commitment) &&
            !eventDates.arrival
        ) {
            eventDates.arrival = eventDates.commitment || eventDates.departure;
        }
        //if departure and arrival but not commitment, then commitment becomes arrival
        if (
            eventDates &&
            eventDates.arrival &&
            !eventDates.commitment &&
            eventDates.departure
        ) {
            eventDates.commitment = eventDates.arrival;
        }
        //Triple check if arrival <= commitment <= departure
        if (
            eventDates &&
            eventDates.commitment &&
            eventDates.departure &&
            eventDates.commitment.toMillis() > eventDates.departure.toMillis()
        ) {
            eventDates.commitment = eventDates.departure;
        }

        if (
            eventDates &&
            eventDates.commitment &&
            eventDates.arrival &&
            eventDates.arrival.toMillis() > eventDates.commitment.toMillis()
        ) {
            eventDates.arrival = eventDates.commitment;
        }

        return eventDates;
    }
}
