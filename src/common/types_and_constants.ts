export type RateLimitError = {
    rateLimited: boolean;
    retryDateString: string;
};

export enum BatchSizeDirection {
    INCREASE = 1,
    DECREASE = -1,
}

//The batch size is used for restrict the number of pages
export const BatchSizeChangeRate = 10;

export enum BatchSizeLimit {
    MAX = 2000,
    MIN = BatchSizeChangeRate,
}
