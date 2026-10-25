-- Migration 093: A fully blank session is a half day; one blank cell is not.
--
-- Refines migration 092 at the HR office's direction (Oct 2026). For a
-- schedule with a break, a day is two sessions — morning (AM in/out) and
-- afternoon (PM in/out):
--   * a session with BOTH cells blank is charged a flat half day (4 hours),
--     unless a holiday/day-level reason excuses it or either slot carries a
--     reason;
--   * a session with ONE blank cell costs nothing — the cell is unsettled and
--     the employee settles it through a correction (migration 092's rule);
--   * a day with no punches at all is an absence, charged by the DTR.
-- The punches that are there are still measured, as in 092. A no-break shift
-- has no half to charge.
--
-- Mirrors dayLateUndertime in src/lib/attendance-schedule.ts. Only
-- hris.day_late_undertime changes; compute_attendance_deduction_minutes (092)
-- delegates to it. The stored late/undertime columns are recomputed for every
-- row, as in 092. VL deductions already posted to the leave ledger are not
-- touched.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.day_late_undertime(
  p_date            DATE,
  p_time_in         TIME,
  p_time_out        TIME,
  p_break_start     TIME,
  p_break_end       TIME,
  p_in_am           TIMESTAMPTZ,
  p_out_am          TIMESTAMPTZ,
  p_in_pm           TIMESTAMPTZ,
  p_out_pm          TIMESTAMPTZ,
  p_reason_in_am    TEXT DEFAULT NULL,
  p_reason_out_am   TEXT DEFAULT NULL,
  p_reason_in_pm    TEXT DEFAULT NULL,
  p_reason_out_pm   TEXT DEFAULT NULL,
  p_no_time_reason  TEXT DEFAULT NULL,
  p_excuse_am       BOOLEAN DEFAULT FALSE,
  p_excuse_pm       BOOLEAN DEFAULT FALSE,
  OUT late_minutes  INT,
  OUT undertime_minutes INT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_crosses     BOOLEAN;
  v_has_break   BOOLEAN;
  v_am_off      BOOLEAN;
  v_pm_off      BOOLEAN;
  -- The stored punches as Manila wall clock (see the TIMEZONE note in 070).
  w_in_am       TIMESTAMP;
  w_in_pm       TIMESTAMP;
  w_out_pm      TIMESTAMP;
  v_sched_in    TIMESTAMP;
  v_sched_out   TIMESTAMP;
  v_sched_bend  TIMESTAMP;
BEGIN
  late_minutes := 0;
  undertime_minutes := 0;

  -- A rest day owes no hours, so nothing is charged on it.
  IF hris.is_rest_day(p_date) THEN
    RETURN;
  END IF;

  -- A day with NO punches at all is an absence; the DTR charges it there.
  IF p_in_am IS NULL AND p_out_am IS NULL
     AND p_in_pm IS NULL AND p_out_pm IS NULL THEN
    RETURN;
  END IF;

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  v_crosses   := (p_time_out <= p_time_in);
  v_has_break := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);
  v_am_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_am, FALSE);
  v_pm_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_pm, FALSE);

  -- Scheduled in is always on the duty date. Scheduled out lands on the next
  -- calendar day when the shift crosses midnight.
  v_sched_in := (p_date::timestamp) + p_time_in;
  IF v_crosses THEN
    v_sched_out := ((p_date + 1)::timestamp) + p_time_out;
  ELSE
    v_sched_out := (p_date::timestamp) + p_time_out;
  END IF;

  -- A session with BOTH cells blank rendered no service: a flat half day,
  -- unless excused or explained by a reason on either of its slots.
  IF v_has_break THEN
    IF p_in_am IS NULL AND p_out_am IS NULL AND NOT v_am_off
       AND p_reason_in_am IS NULL AND p_reason_out_am IS NULL THEN
      undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
    END IF;
    IF p_in_pm IS NULL AND p_out_pm IS NULL AND NOT v_pm_off
       AND p_reason_in_pm IS NULL AND p_reason_out_pm IS NULL THEN
      undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
    END IF;
  END IF;

  -- Lateness: measured when there is an arrival to measure.
  IF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  IF v_pm_off THEN
    RETURN;
  END IF;

  -- Early departure: measured when there is a departure to measure. A missing
  -- clock-out is unsettled and costs nothing.
  IF p_reason_out_pm IS NULL AND w_out_pm IS NOT NULL THEN
    undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
  END IF;

  -- A late return from lunch is afternoon service not rendered.
  IF v_has_break AND p_reason_in_pm IS NULL AND w_in_pm IS NOT NULL THEN
    -- The scheduled return from lunch, on the next calendar day when a
    -- midnight-crossing shift takes its break past midnight.
    IF v_crosses AND p_break_end < p_time_in THEN
      v_sched_bend := ((p_date + 1)::timestamp) + p_break_end;
    ELSE
      v_sched_bend := (p_date::timestamp) + p_break_end;
    END IF;
    undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_pm - v_sched_bend)) / 60.0)::INT);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

-- Recompute the stored columns under the new rule, resolving each row's
-- schedule and holiday exactly as compute_attendance_deduction_minutes does.
WITH resolved AS (
  SELECT
    l.id,
    l.date,
    l.time_in_am, l.time_out_am, l.time_in_pm, l.time_out_pm,
    l.time_in_am_reason, l.time_out_am_reason,
    l.time_in_pm_reason, l.time_out_pm_reason,
    l.no_time_reason,
    h.type AS holiday_type,
    COALESCE(rs.time_in,     es.time_in,     ds.time_in,     TIME '08:00') AS time_in,
    COALESCE(rs.time_out,    es.time_out,    ds.time_out,    TIME '17:00') AS time_out,
    -- break_start/break_end come from the SAME schedule as the hours.
    CASE
      WHEN rs.id IS NOT NULL THEN rs.break_start
      WHEN es.id IS NOT NULL THEN es.break_start
      WHEN ds.id IS NOT NULL THEN ds.break_start
      ELSE TIME '12:00'
    END AS break_start,
    CASE
      WHEN rs.id IS NOT NULL THEN rs.break_end
      WHEN es.id IS NOT NULL THEN es.break_end
      WHEN ds.id IS NOT NULL THEN ds.break_end
      ELSE TIME '13:00'
    END AS break_end
  FROM hris.attendance_logs l
  LEFT JOIN hris.schedules rs ON rs.id = l.schedule_id
  LEFT JOIN hris.employees e  ON e.id = l.employee_id
  LEFT JOIN hris.schedules es ON es.id = e.schedule_id
  LEFT JOIN hris.schedules ds ON ds.is_default
  LEFT JOIN hris.holidays h   ON h.date = l.date
),
computed AS (
  SELECT r.id, d.late_minutes, d.undertime_minutes
  FROM resolved r
  CROSS JOIN LATERAL hris.day_late_undertime(
    r.date, r.time_in, r.time_out, r.break_start, r.break_end,
    r.time_in_am, r.time_out_am, r.time_in_pm, r.time_out_pm,
    r.time_in_am_reason, r.time_out_am_reason,
    r.time_in_pm_reason, r.time_out_pm_reason,
    r.no_time_reason,
    hris.holiday_excuses_am(r.holiday_type),
    hris.holiday_excuses_pm(r.holiday_type)
  ) d
)
UPDATE hris.attendance_logs l
SET
  late_minutes      = c.late_minutes,
  is_late           = c.late_minutes > 0,
  undertime_minutes = c.undertime_minutes,
  is_undertime      = c.undertime_minutes > 0
FROM computed c
WHERE c.id = l.id
  AND (l.late_minutes IS DISTINCT FROM c.late_minutes
    OR l.undertime_minutes IS DISTINCT FROM c.undertime_minutes);
