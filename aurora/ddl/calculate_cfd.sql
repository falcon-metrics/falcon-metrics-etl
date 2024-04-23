-- FUNCTION: public.calculate_cfd(character varying, timestamp without time zone, timestamp without time zone, character varying, character varying, character varying[], character varying[], character varying[])

-- DROP FUNCTION public.calculate_cfd(character varying, timestamp without time zone, timestamp without time zone, character varying, character varying, character varying[], character varying[], character varying[]);

CREATE OR REPLACE FUNCTION public.calculate_cfd(
	p_partitionkey character varying,
	p_startdate timestamp without time zone,
	p_enddate timestamp without time zone,
	p_inprogress character varying,
	p_completed character varying,
	p_flomatikaworkitemtypeid character varying[],
	p_classesofservice character varying[],
	p_workitemids character varying[])
    RETURNS TABLE(numberofitems numeric, state character varying, flomatikasnapshotdate date) 
    LANGUAGE 'sql'

AS $BODY$
with done_state as (
	SELECT	sum(count("flomatikaSnapshotDate"::date)) over (partition by "state" ORDER BY "state", "flomatikaSnapshotDate"::date) as numberOfItems,
			"state",
			"flomatikaSnapshotDate"::date
	FROM    snapshots
	WHERE   "partitionKey" = p_partitionKey

	AND     (coalesce(p_startDate, TIMESTAMP 'epoch') = TIMESTAMP 'epoch' OR "flomatikaSnapshotDate" >= p_startDate)
	AND     (coalesce(p_endDate, TIMESTAMP 'epoch') = TIMESTAMP 'epoch' OR "flomatikaSnapshotDate" <= p_endDate)

	AND		"stateCategory" = p_completed
	
	AND		(p_flomatikaWorkItemTypeId is null
	 OR		"flomatikaWorkItemTypeId" = ANY(p_flomatikaWorkItemTypeId))

	AND		(p_classesOfService is null
	 OR		"classOfServiceId" = ANY(p_classesOfService))

	AND		(p_workItemIds is null
	 OR		"workItemId" = ANY(p_workItemIds))
	
	GROUP BY  "state", "flomatikaSnapshotDate"::date
	ORDER BY  "state", "flomatikaSnapshotDate"
)

SELECT	*
FROM	done_state

UNION

	SELECT	count("flomatikaSnapshotDate") as numberOfItems,
			"state",
			"flomatikaSnapshotDate"::date
	FROM    snapshots
	WHERE   "partitionKey" = p_partitionKey

	AND     (coalesce(p_startDate, TIMESTAMP 'epoch') = TIMESTAMP 'epoch' OR "flomatikaSnapshotDate" >= p_startDate)
	AND     (coalesce(p_endDate, TIMESTAMP 'epoch') = TIMESTAMP 'epoch' OR "flomatikaSnapshotDate" <= p_endDate)

	AND		"stateCategory" = p_inProgress
	
	AND		(p_flomatikaWorkItemTypeId is null
	 OR		"flomatikaWorkItemTypeId" = ANY(p_flomatikaWorkItemTypeId)	)

	AND		(p_classesOfService is null
	 OR		"classOfServiceId" = ANY(p_classesOfService))

	AND		(p_workItemIds is null
	 OR		"workItemId" = ANY(p_workItemIds))

	GROUP BY "state", "flomatikaSnapshotDate"::date
	ORDER BY "state", "flomatikaSnapshotDate"
$BODY$;

ALTER FUNCTION public.calculate_cfd(character varying, timestamp without time zone, timestamp without time zone, character varying, character varying, character varying[], character varying[], character varying[])
    OWNER TO postgres;
