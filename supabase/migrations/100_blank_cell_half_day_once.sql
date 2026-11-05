-- Migration 100: The blank-cell half day is charged once a day, on every schedule.
--
-- Refines migration 099 at the HR office's direction (Nov 2026):
--   * one half day (4 hours) however many sessions have blanks. In at 8:00, out
--     at 17:00 with no lunch scans is four hours, where 099 charged seven;
--   * a no-break shift missing its clock-in or clock-out is charged the same half
--     day, in place of the minutes the other punch would measure. 099 left it free.
-- Everything else in 099 stands: a reason or a holiday half excuses a session, a
-- complete session is still measured to the minute, a rest day owes nothing, and
-- ABSENT excuses nothing.
--
-- Mirrors dayLateUndertime in src/lib/attendance-schedule.ts. Only
-- hris.day_late_undertime changes; compute_attendance_deduction_minutes delegates
-- to it. The stored late/undertime columns are recomputed for every row. VL
-- deductions already posted to the leave ledger are not touched: a month's
-- deduction is recomputed by the app when that month's attendance is next
-- imported, replayed or corrected.

SET search_path TO hris, public, auth, extensions;

-- Same signature as migration 094, so the existing grant carries over.
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
  -- Whether the employee's schedule makes this a rest day
  -- (hris.resolve_day_schedule). NULL: Saturday/Sunday, as before.
  p_rest_day        BOOLEAN DEFAULT NULL,
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
  v_am_half     BOOLEAN;
  v_pm_half     BOOLEAN;
  -- The slot reasons that excuse. ABSENT is a statement, not an excuse.
  v_in_am_why   TEXT := NULLIF(p_reason_in_am,  'absent');
  v_out_am_why  TEXT := NULLIF(p_reason_out_am, 'absent');
  v_in_pm_why   TEXT := NULLIF(p_reason_in_pm,  'absent');
  v_out_pm_why  TEXT := NULLIF(p_reason_out_pm, 'absent');
  v_am_absent   BOOLEAN := 'absent' IN (p_reason_in_am, p_reason_out_am);
  v_pm_absent   BOOLEAN := 'absent' IN (p_reason_in_pm, p_reason_out_pm);
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
  IF COALESCE(p_rest_day, hris.is_rest_day(p_date)) THEN
    RETURN;
  END IF;

  v_has_break := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);

  -- A day with NO punches at all is an absence; the DTR charges it there. The
  -- exception is one session ABSENT and the other explained by a reason: that
  -- row is not is_absent, so the absent half is charged below.
  IF p_in_am IS NULL AND p_out_am IS NULL
     AND p_in_pm IS NULL AND p_out_pm IS NULL
     AND NOT (
       v_has_break AND (
         (COALESCE(v_am_absent, FALSE)
            AND (v_in_pm_why IS NOT NULL OR v_out_pm_why IS NOT NULL))
         OR (COALESCE(v_pm_absent, FALSE)
            AND (v_in_am_why IS NOT NULL OR v_out_am_why IS NOT NULL))
       )
     ) THEN
    RETURN;
  END IF;

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  v_crosses   := (p_time_out <= p_time_in);
  v_am_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_am, FALSE);
  v_pm_off    := p_no_time_reason IS NOT NULL OR COALESCE(p_excuse_pm, FALSE);

  -- A session with EITHER cell blank owes a flat half day, unless excused or
  -- explained by a reason on either of its slots. A schedule with no break is one
  -- session: a missing clock-in or clock-out marks the whole shift.
  IF v_has_break THEN
    v_am_half := (p_in_am IS NULL OR p_out_am IS NULL) AND NOT v_am_off
                 AND v_in_am_why IS NULL AND v_out_am_why IS NULL;
    v_pm_half := (p_in_pm IS NULL OR p_out_pm IS NULL) AND NOT v_pm_off
                 AND v_in_pm_why IS NULL AND v_out_pm_why IS NULL;
  ELSE
    v_am_half := (p_in_am IS NULL AND NOT v_am_off AND v_in_am_why IS NULL)
              OR (p_out_pm IS NULL AND NOT v_pm_off AND v_out_pm_why IS NULL);
    v_pm_half := v_am_half;
  END IF;

  -- Charged once a day, however many sessions owe it.
  IF v_am_half OR v_pm_half THEN
    undertime_minutes := hris.half_day_undertime_minutes();
  END IF;

  -- Scheduled in is always on the duty date. Scheduled out lands on the next
  -- calendar day when the shift crosses midnight.
  v_sched_in := (p_date::timestamp) + p_time_in;
  IF v_crosses THEN
    v_sched_out := ((p_date + 1)::timestamp) + p_time_out;
  ELSE
    v_sched_out := (p_date::timestamp) + p_time_out;
  END IF;

  -- Lateness: measured when there is an arrival to measure, on a morning not
  -- already charged flat.
  IF NOT v_am_off AND NOT v_am_half AND v_in_am_why IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  IF v_pm_off OR v_pm_half THEN
    RETURN;
  END IF;

  -- Early departure: measured when there is a departure to measure.
  IF v_out_pm_why IS NULL AND w_out_pm IS NOT NULL THEN
    undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
  END IF;

  -- A late return from lunch is afternoon service not rendered.
  IF v_has_break AND v_in_pm_why IS NULL AND w_in_pm IS NOT NULL THEN
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

-- Recompute the stored columns under the new rule, resolving each row's schedule
-- exactly as compute_attendance_deduction_minutes does: a correction's pin (always
-- a working day), otherwise hris.resolve_day_schedule.
WITH resolved AS (
  SELECT
    l.id,
    l.date,
    l.time_in_am, l.time_out_am, l.time_in_pm, l.time_out_pm,
    l.time_in_am_reason, l.time_out_am_reason,
    l.time_in_pm_reason, l.time_out_pm_reason,
    l.no_time_reason,
    h.type AS holiday_type,
    CASE WHEN rs.id IS NOT NULL THEN rs.time_in     ELSE ds.time_in     END AS time_in,
    CASE WHEN rs.id IS NOT NULL THEN rs.time_out    ELSE ds.time_out    END AS time_out,
    CASE WHEN rs.id IS NOT NULL THEN rs.break_start ELSE ds.break_start END AS break_start,
    CASE WHEN rs.id IS NOT NULL THEN rs.break_end   ELSE ds.break_end   END AS break_end,
    CASE WHEN rs.id IS NOT NULL THEN FALSE          ELSE ds.is_rest_day END AS rest_day
  FROM hris.attendance_logs l
  LEFT JOIN hris.schedules rs ON rs.id = l.schedule_id
  LEFT JOIN hris.holidays h   ON h.date = l.date
  CROSS JOIN LATERAL hris.resolve_day_schedule(l.employee_id, l.date) ds
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
    hris.holiday_excuses_pm(r.holiday_type),
    r.rest_day
  ) d
)
UPDATE hris.attendance_logs l
SET
  late_minutes      = c.late_minutes,
  is_late           = c.late_minutes > 0,
  undertime_minutes = LEAST(c.undertime_minutes, 420),
  is_undertime      = c.undertime_minutes > 0
FROM computed c
WHERE c.id = l.id
  AND (l.late_minutes IS DISTINCT FROM c.late_minutes
    OR l.undertime_minutes IS DISTINCT FROM LEAST(c.undertime_minutes, 420));
