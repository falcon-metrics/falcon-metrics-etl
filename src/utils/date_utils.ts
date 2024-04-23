import { DateTime } from 'luxon';
import { Logger } from 'pino';
import { StateCategory } from '../data/state_category';

export const checkIfNowPastDueDate = (
    base?: Date,
    addedPeriodInMinutes?: number,
    logger?: Logger,
): boolean => {
    if (!base) return true;

    if (!addedPeriodInMinutes) return true;

    const addedPeriodInMillis = addedPeriodInMinutes * 60000;
    const dueDateInMillis = Date.now() - addedPeriodInMillis;
    const pastDueDate = base.valueOf() <= dueDateInMillis;
    if (!pastDueDate && logger) {
        logger?.info(
            `Last run on date is ${base.toISOString()}, next run should be later than ${new Date(
                dueDateInMillis,
            ).toISOString()}`,
        );
    }
    return pastDueDate;
};

export const convertToSurrogateKeyFormat = (
    isoFormattedString: string,
): string => {
    const dateTime = DateTime.fromISO(isoFormattedString);
    const skFormat = dateTime.toFormat('yyyyLLdd');
    return skFormat;
};

export enum StateCategories {
    PRECEDING = 'preceding',
    PROPOSED = 'proposed',
    INPROGRESS = 'inprogress',
    COMPLETED = 'completed',
}

export const stateCategoryByDate = (
    arrivalDate?: string,
    commitmentDate?: string,
    departureDate?: string,
): StateCategories => {
    let stateCategory = StateCategories.PRECEDING;

    if (arrivalDate && !commitmentDate && !departureDate) {
        stateCategory = StateCategories.PROPOSED;
        return stateCategory;
    }

    if (commitmentDate && !departureDate) {
        stateCategory = StateCategories.INPROGRESS;
        return stateCategory;
    }

    if (departureDate) {
        stateCategory = StateCategories.COMPLETED;
        return stateCategory;
    }

    return stateCategory;
};

export const stateCategoryRelativeToDate = (
    comparisonDate: DateTime,
    arrivalDate?: DateTime,
    commitmentDate?: DateTime,
    departureDate?: DateTime,
): string => {
    // console.log(`comparison: ${comparisonDate}. arrival: ${arrivalDate}, commitment: ${commitmentDate}, departure: ${departureDate}`);
    if (!arrivalDate || comparisonDate < arrivalDate)
        return StateCategory[StateCategory.PRECEDING].toLowerCase();
    // if changeDate is < flomatikaCommitmentDate then stateCategory = Proposed
    if (!commitmentDate || comparisonDate < commitmentDate) {
        return StateCategory[StateCategory.PROPOSED].toLowerCase();
    }

    //if changeDate is >= flomatikaCommitmentDate and <  flomatikaDepartureDate then stateCategory = inProgress
    if (
        comparisonDate >= commitmentDate &&
        (!departureDate || comparisonDate < departureDate)
    ) {
        return StateCategory[StateCategory.INPROGRESS].toLowerCase();
    }

    //if changeDate is >= flomatikaDepartureDate then stateCategory = completed
    if (departureDate && comparisonDate >= departureDate) {
        return StateCategory[StateCategory.COMPLETED].toLowerCase();
    }
    // console.log('defaulted');
    return StateCategory[StateCategory.PRECEDING].toLowerCase();
};

// TODO : Write some unit tests
/**
 * Compute the difference between to days in terms of whole days
 *
 * Start date is moved to the start of the day and the end date is moved to the end of the day
 *
 * (might be better if this is called numberOfFillers. Because dates are being shifted to start and end of day
 * inside the function)
 * @param startDate
 * @param endDate
 * @returns
 */
export const diffInWholeDays = (startDate: DateTime, endDate: DateTime) => {
    startDate = startDate.startOf('day');
    endDate = endDate.endOf('day');
    // Diff returns a partial day
    const diff = endDate.diff(startDate, 'days').days;
    // Use floor to round down. 0.x days becomes 0 days, 1.2 days becomes 1 day
    const diffWholeDays = Math.floor(diff);
    return diffWholeDays;
};
