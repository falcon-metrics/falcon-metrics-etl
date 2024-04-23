module.exports = serverless => {
    let rate = 5;

    const isDev = process.env['ETL_IS_DEV']?.toLowerCase() === 'true';
    if (isDev) rate = 1;

    let schedule =
        rate === 1 ? `rate(${rate} minute)` : `rate(${rate} minutes)`;

    let event = {
        name: 'kickOffExtracts',
        description: 'Kick off extracts from back ends that are due',
    };

    let scheduleEvent = {
        eventBridge: {
            ...event,
            schedule: schedule,
        },
    };

    if (serverless.processedInput.commands[0] === 'offline') {
        scheduleEvent = {
            schedule: {
                ...event,
                rate: schedule,
            },
        };
    }

    //console.debug('scheduleEvent: ', scheduleEvent);

    return scheduleEvent;
};
