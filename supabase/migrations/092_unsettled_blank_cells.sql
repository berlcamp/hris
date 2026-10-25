-- Migration 092: A blank DTR cell costs nothing — it is unsettled.
--
-- Migration 070 charged a session missing either of its two punches a flat half
-- day. In practice that billed an employee who came in at 8:00 and left at
-- 17:00 but skipped the lunch scans eight hours of undertime, and the DTR then
-- reclassified the day ABSENT and hid the times. The HR office's rule (Oct
-- 2026): a blank cell is UNSETTLED. The employee settles it through a
-- correction, and until then it is not charged. The punches that ARE there are
-- still measured — lateness, a late return from lunch, an early departure.
-- This applies to every missing punch, a no-break shift's missing clock-out
-- included, and to every month, past ones too.
--
-- The rule lives in TypeScript (dayLateUndertime, src/lib/attendance-schedule.ts).
-- As in 070, two things in the database need the same answer:
--   1. hris.day_late_undertime — mirrored clause for clause; it feeds the
--      stored attendance_logs columns and the VL auto-deduction.
--   2. hris.compute_attendance_deduction_minutes — no longer skips a day whose
--      undertime reaches 8 hours as an "absence". The DTR no longer turns a day
--      with punches into an absence either; it caps the day at 7 hours.
--
-- Then the stored late/undertime columns are recomputed for every row (the
-- attendance LIST reads them). The DTR and the reports already recompute at
-- render time.
--
-- VL deductions ALREADY POSTED to the leave ledger are not touched here. A
-- month's deduction is recomputed by the app when that month's attendance is
-- next imported, replayed or corrected.

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

-- The VL auto-deduction, as in 072 but without the 8-hour "absence" skip: the
-- DTR caps a day with punches at 7 hours instead of calling it absent, and the
-- deduction must agree with the DTR exactly.
CREATE OR REPLACE FUNCTION hris.compute_attendance_deduction_minutes(
  p_employee_id UUID,
  p_year INT,
  p_month INT
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_emp_sched   hris.schedules%ROWTYPE;
  v_def_sched   hris.schedules%ROWTYPE;
  v_start       DATE;
  v_end         DATE;
  v_total_mins  INT := 0;
  rec           RECORD;
  v_time_in     TIME;
  v_time_out    TIME;
  v_break_start TIME;
  v_break_end   TIME;
  v_late        INT;
  v_undertime   INT;
BEGIN
  SELECT s.* INTO v_emp_sched
    FROM hris.employees e
    JOIN hris.schedules s ON s.id = e.schedule_id
    WHERE e.id = p_employee_id;

  SELECT d.* INTO v_def_sched
    FROM hris.schedules d
    WHERE d.is_default
    LIMIT 1;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR rec IN
    SELECT l.*, rs.time_in AS pin_time_in, rs.time_out AS pin_time_out,
           rs.break_start AS pin_break_start, rs.break_end AS pin_break_end,
           rs.id AS pin_id,
           h.type AS holiday_type
      FROM hris.attendance_logs l
      LEFT JOIN hris.schedules rs ON rs.id = l.schedule_id
      LEFT JOIN hris.holidays h   ON h.date = l.date
      WHERE l.employee_id = p_employee_id
        AND l.date BETWEEN v_start AND v_end
        AND COALESCE(l.is_absent, false) = false
  LOOP
    -- The day's pin, then the employee's assignment, then the org default,
    -- then the hardcoded last resort — hours and lunch always from the SAME
    -- schedule.
    IF rec.pin_id IS NOT NULL THEN
      v_time_in := rec.pin_time_in; v_time_out := rec.pin_time_out;
      v_break_start := rec.pin_break_start; v_break_end := rec.pin_break_end;
    ELSIF v_emp_sched.id IS NOT NULL THEN
      v_time_in := v_emp_sched.time_in; v_time_out := v_emp_sched.time_out;
      v_break_start := v_emp_sched.break_start; v_break_end := v_emp_sched.break_end;
    ELSIF v_def_sched.id IS NOT NULL THEN
      v_time_in := v_def_sched.time_in; v_time_out := v_def_sched.time_out;
      v_break_start := v_def_sched.break_start; v_break_end := v_def_sched.break_end;
    ELSE
      v_time_in := TIME '08:00'; v_time_out := TIME '17:00';
      v_break_start := TIME '12:00'; v_break_end := TIME '13:00';
    END IF;

    SELECT d.late_minutes, d.undertime_minutes
      INTO v_late, v_undertime
      FROM hris.day_late_undertime(
        rec.date, v_time_in, v_time_out, v_break_start, v_break_end,
        rec.time_in_am, rec.time_out_am, rec.time_in_pm, rec.time_out_pm,
        rec.time_in_am_reason, rec.time_out_am_reason,
        rec.time_in_pm_reason, rec.time_out_pm_reason,
        rec.no_time_reason,
        hris.holiday_excuses_am(rec.holiday_type),
        hris.holiday_excuses_pm(rec.holiday_type)
      ) d;

    v_total_mins := v_total_mins + v_late + LEAST(v_undertime, 420);
  END LOOP;

  RETURN v_total_mins;
END;
$$;

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
