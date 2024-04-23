type Timer = {
    start: (label: string) => void;
    end: (label: string) => number;
};
/**
 * Forge env doesnt have console.time
 */
export const getTimer = (): Timer => {
    const map = new Map();

    const start = (label: string): void => {
        map.set(label, Date.now());
    };

    const end = (label: string): number => {
        if (!map.has(label)) {
            console.warn(`Timer with label ${label} was not started`);
            return -1;
        }
        const start = map.get(label);
        map.delete(label);
        const diff = Date.now() - start;
        // console.log(`[TIMER] ${label}: ${diff}ms`);
        return diff;
    };
    return {
        start,
        end,
    };
};
