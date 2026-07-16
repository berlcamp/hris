-- READ-ONLY diagnostic. Sizes how many already-imported attendance rows were
-- mis-bucketed by the pre-fix bucketPunchesForDuty(). Changes nothing.
--
-- Run against production (Supabase SQL editor) to decide whether a re-import is
-- worth it and for which months.
--
-- Times are stored by string concatenation (`${date}T${time}:00`, no offset)
-- into TIMESTAMPTZ on a UTC database, so the wall-clock the DTR prints is the
-- value AT TIME ZONE 'UTC'. That is what these queries compare against.

SET search_path TO hris, public;

WITH sched AS (
  SELECT
    l.id,
    l.employee_id,
    l.date,
    l.source,
    (l.time_in_am AT TIME ZONE 'UTC')::time AS in_am,
    (l.time_out_am AT TIME ZONE 'UTC')::time AS out_am,
    (l.time_in_pm AT TIME ZONE 'UTC')::time AS in_pm,
    (l.time_out_pm AT TIME ZONE 'UTC')::time AS out_pm,
    l.late_minutes,
    l.undertime_minutes,
    COALESCE(s.break_start, ds.break_start) AS break_start,
    COALESCE(s.break_end,   ds.break_end)   AS break_end,
    COALESCE(s.time_out,    ds.time_out)    AS time_out
  FROM hris.attendance_logs l
  LEFT JOIN hris.schedules s  ON s.id = COALESCE(l.schedule_id, (SELECT e.schedule_id FROM hris.employees e WHERE e.id = l.employee_id))
  LEFT JOIN hris.schedules ds ON ds.is_default
),
classified AS (
  SELECT *,
    -- Bug A: a midday ARRIVAL forced into the AM column. The only way an
    -- AM arrival lands inside the lunch window is the empty-AM push.
    (break_start IS NOT NULL AND in_am >= break_start AND in_am < break_end) AS bug_a,
    -- Bug B: a lone PM punch recorded as an arrival with no departure, which
    -- charges undertime from break_end to time_out (~4h) every such day.
    (in_pm IS NOT NULL AND out_pm IS NULL) AS bug_b
  FROM sched
)
SELECT
  'Bug A — midday arrival stored as AM arrival' AS issue,
  count(*) AS affected_rows,
  count(DISTINCT employee_id) AS affected_employees,
  min(date) AS earliest,
  max(date) AS latest,
  sum(late_minutes) AS phantom_late_minutes,
  sum(undertime_minutes) AS phantom_undertime_minutes
FROM classified WHERE bug_a
UNION ALL
SELECT
  'Bug B — lone PM punch stored as arrival, no departure',
  count(*),
  count(DISTINCT employee_id),
  min(date),
  max(date),
  sum(late_minutes),
  sum(undertime_minutes)
FROM classified WHERE bug_b AND NOT bug_a;

-- Per-month breakdown of Bug B (the phantom-undertime one), worst first.
-- Uncomment to see which import batches to redo.
--
-- SELECT to_char(date,'YYYY-MM') AS month, count(*) AS rows,
--        count(DISTINCT employee_id) AS employees,
--        sum(undertime_minutes) AS undertime_minutes
-- FROM classified WHERE bug_b AND NOT bug_a
-- GROUP BY 1 ORDER BY 1 DESC;
