-- Migration 070: The half-day undertime rule, in SQL.
--
-- A DTR cell cannot be blank and cost nothing. A session (morning = AM in/out,
-- afternoon = PM in/out) that does not carry BOTH its punches rendered no
-- verifiable service and is charged a flat half day — four hours — whatever
-- shape the schedule is. Before this, an afternoon with a departure but no
-- arrival cost nothing at all, and a day with only PM punches cost nothing
-- either.
--
-- The rule lives in TypeScript (dayLateUndertime, src/lib/attendance-schedule.ts)
-- because that is where the DTR, the importer, manual entry and the correction
-- workflow all read it. This migration exists because two things in the
-- database need the same answer:
--
--   1. hris.attendance_logs.late_minutes / undertime_minutes — derived columns
--      written by the app. Every row predating this migration holds a number
--      computed under the old rule. The DTR and the attendance report recompute
--      at render time so they are already correct, but the attendance LIST
--      reads the stored columns, so it would keep showing the old numbers
--      forever.
--
--   2. hris.compute_attendance_deduction_minutes (migrations 032/035/036) —
--      the VL auto-deduction. Its whole contract, in its own header, is to
--      agree with the DTR exactly. Left alone it would silently under-charge
--      precisely the days this rule started charging.
--
-- Rather than write the arithmetic twice more, both go through ONE new
-- function, hris.day_late_undertime, which mirrors dayLateUndertime clause for
-- clause. Two implementations of a rule that has already changed twice is one
-- too many; three would be indefensible.
--
-- TIMEZONE — the trap migration 035 exists for. attendance_logs stores the
-- device's Manila wall-clock DIGITS as a naive timestamp with a +00 offset:
-- a 07:54 Manila punch is stored as 07:54+00, not 23:54Z. So the wall clock is
-- read back with `AT TIME ZONE 'UTC'`, never 'Asia/Manila', and the schedule
-- anchors are plain timestamps built from the duty date. Both sides of every
-- subtraction are then the same Manila wall-clock basis, which is what the
-- TypeScript does when it parses "YYYY-MM-DDTHH:MM:00" as local time.

SET search_path TO hris, public, auth, extensions;

-- A half day. Flat, deliberately NOT derived from time_in -> break_start: a
-- 07:30-16:30 schedule has a 4.5-hour morning and a 3.5-hour afternoon, and an
-- unaccounted one of either is four hours. The DTR's unit of undertime is the
-- half day.
CREATE OR REPLACE FUNCTION hris.half_day_undertime_minutes()
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 240 $$;

-- One day's late + undertime, mirroring dayLateUndertime in
-- src/lib/attendance-schedule.ts. Punch arguments are the stored TIMESTAMPTZ
-- values; reason arguments are the per-slot reason codes (NULL when none).
--
-- Returned together because the two interact: the flat half-day charge
-- SUPERSEDES that session's per-minute charges, so a morning already billed as
-- four unaccounted hours is not also billed for arriving late — which would put
-- more than four hours of penalty on a four-hour session.
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
  OUT late_minutes  INT,
  OUT undertime_minutes INT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_crosses     BOOLEAN;
  v_has_break   BOOLEAN;
  v_day_excused BOOLEAN;
  -- The stored punches as Manila wall clock (see the TIMEZONE note above).
  w_in_am       TIMESTAMP;
  w_out_am      TIMESTAMP;
  w_in_pm       TIMESTAMP;
  w_out_pm      TIMESTAMP;
  v_sched_in    TIMESTAMP;
  v_sched_out   TIMESTAMP;
  v_sched_bend  TIMESTAMP;
  v_am_complete BOOLEAN;
  v_pm_complete BOOLEAN;
  v_am_excused  BOOLEAN;
  v_pm_excused  BOOLEAN;
BEGIN
  late_minutes := 0;
  undertime_minutes := 0;

  w_in_am  := p_in_am  AT TIME ZONE 'UTC';
  w_out_am := p_out_am AT TIME ZONE 'UTC';
  w_in_pm  := p_in_pm  AT TIME ZONE 'UTC';
  w_out_pm := p_out_pm AT TIME ZONE 'UTC';

  -- A day with NO punches at all is an ABSENCE, not two incomplete sessions.
  -- The absent flag carries it and the DTR charges the full eight hours there.
  -- Charging 4 + 4 here as well would turn every rest day, holiday and approved
  -- leave into an eight-hour undertime.
  IF w_in_am IS NULL AND w_out_am IS NULL
     AND w_in_pm IS NULL AND w_out_pm IS NULL THEN
    RETURN;
  END IF;

  v_crosses     := (p_time_out <= p_time_in);
  v_has_break   := (p_break_start IS NOT NULL AND p_break_end IS NOT NULL);
  v_day_excused := (p_no_time_reason IS NOT NULL);

  -- Scheduled in is always on the duty date. Scheduled out lands on the next
  -- calendar day when the shift crosses midnight.
  v_sched_in := (p_date::timestamp) + p_time_in;
  IF v_crosses THEN
    v_sched_out := ((p_date + 1)::timestamp) + p_time_out;
  ELSE
    v_sched_out := (p_date::timestamp) + p_time_out;
  END IF;

  ---------------------------------------------------------------------------
  -- No break: a single in/out pair has no half to charge, so this keeps the
  -- treatment it has always had — a missing clock-out bills the whole shift.
  ---------------------------------------------------------------------------
  IF NOT v_has_break THEN
    IF NOT v_day_excused AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
      late_minutes := GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
    END IF;

    IF v_day_excused OR p_reason_out_pm IS NOT NULL THEN
      undertime_minutes := 0;
    ELSIF w_out_pm IS NULL THEN
      -- Present but never clocked out: the whole shift is uncovered. The
      -- baseline is time_in ON THE DUTY DATE, matching undertimeMinutesFor.
      IF w_in_am IS NOT NULL THEN
        undertime_minutes := GREATEST(0, ROUND(
          EXTRACT(EPOCH FROM (v_sched_out - ((p_date::timestamp) + p_time_in)))
          / 60.0)::INT);
      END IF;
    ELSE
      undertime_minutes := GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
    END IF;

    RETURN;
  END IF;

  ---------------------------------------------------------------------------
  -- Has break: two sessions, each charged a flat half day when incomplete.
  ---------------------------------------------------------------------------
  -- The scheduled return from lunch, on the next calendar day when a
  -- midnight-crossing shift takes its break past midnight.
  IF v_crosses AND p_break_end < p_time_in THEN
    v_sched_bend := ((p_date + 1)::timestamp) + p_break_end;
  ELSE
    v_sched_bend := (p_date::timestamp) + p_break_end;
  END IF;

  v_am_complete := (w_in_am IS NOT NULL AND w_out_am IS NOT NULL);
  v_pm_complete := (w_in_pm IS NOT NULL AND w_out_pm IS NOT NULL);
  -- A reason on either of a session's slots explains the missing punch, so the
  -- flat charge does not apply. The punches that ARE there are still measured:
  -- tagging the two lunch slots NO BREAK on a day worked straight through does
  -- not also forgive arriving half an hour late.
  v_am_excused := v_day_excused
    OR p_reason_in_am IS NOT NULL OR p_reason_out_am IS NOT NULL;
  v_pm_excused := v_day_excused
    OR p_reason_in_pm IS NOT NULL OR p_reason_out_pm IS NOT NULL;

  -- --- morning ---
  IF NOT v_am_complete AND NOT v_am_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_day_excused AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  -- --- afternoon ---
  IF NOT v_pm_complete AND NOT v_pm_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_day_excused THEN
    -- Early departure, measured only when there is a departure to measure.
    IF p_reason_out_pm IS NULL AND w_out_pm IS NOT NULL THEN
      undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (v_sched_out - w_out_pm)) / 60.0)::INT);
    END IF;
    -- A late return from lunch is afternoon service not rendered.
    IF p_reason_in_pm IS NULL AND w_in_pm IS NOT NULL THEN
      undertime_minutes := undertime_minutes + GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (w_in_pm - v_sched_bend)) / 60.0)::INT);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION hris.half_day_undertime_minutes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Backfill the stored derived columns.
-- ---------------------------------------------------------------------------
--
-- Schedule resolution mirrors the app, most specific first: the row's own pin,
-- then the employee's assignment, then the org default row (migration 036),
-- then the hardcoded 8-5/12-1 last resort (DEFAULT_SCHEDULE).
--
-- Only the derived minute columns and their booleans are touched. is_absent is
-- left exactly as it stands: it is a statement about whether the day was
-- worked, not a function of these minutes, and the DTR applies its own
-- 8-hour reclassification at render time without writing it back.
WITH resolved AS (
  SELECT
    l.id,
    l.date,
    l.time_in_am, l.time_out_am, l.time_in_pm, l.time_out_pm,
    l.time_in_am_reason, l.time_out_am_reason,
    l.time_in_pm_reason, l.time_out_pm_reason,
    l.no_time_reason,
    COALESCE(rs.time_in,     es.time_in,     ds.time_in,     TIME '08:00') AS time_in,
    COALESCE(rs.time_out,    es.time_out,    ds.time_out,    TIME '17:00') AS time_out,
    -- break_start/break_end are read from the SAME schedule the hours came
    -- from: coalescing them independently could pair one schedule's hours with
    -- another's lunch and invent a shift nobody works.
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
),
computed AS (
  SELECT
    r.id,
    d.late_minutes,
    d.undertime_minutes
  FROM resolved r
  CROSS JOIN LATERAL hris.day_late_undertime(
    r.date, r.time_in, r.time_out, r.break_start, r.break_end,
    r.time_in_am, r.time_out_am, r.time_in_pm, r.time_out_pm,
    r.time_in_am_reason, r.time_out_am_reason,
    r.time_in_pm_reason, r.time_out_pm_reason,
    r.no_time_reason
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
  -- Only rows whose numbers actually move, so updated_at-style triggers and
  -- replication traffic stay proportional to the real change.
  AND (l.late_minutes IS DISTINCT FROM c.late_minutes
    OR l.undertime_minutes IS DISTINCT FROM c.undertime_minutes);

-- ---------------------------------------------------------------------------
-- 2. The VL auto-deduction, on the same rule.
-- ---------------------------------------------------------------------------
--
-- Rewritten to delegate to hris.day_late_undertime instead of re-deriving
-- late/undertime from the outer punch pair. Three consequences, all of them
-- the point:
--
--   * The half-day rule now reaches the deduction, so an afternoon with no
--     arrival is charged there exactly as it is on the DTR.
--   * Per-slot reasons are honoured. The old version ignored them entirely, so
--     an OFFICIAL BUSINESS morning was deducted as tardiness.
--   * A day's own schedule pin (attendance_logs.schedule_id) is respected. The
--     old version scored every day against the employee's CURRENT assignment,
--     so a night shift pinned to one day was measured as a day shift.
--
-- The DTR's cap is applied too, for the same reason the rest of this exists:
-- eight hours or more of undertime means no meaningful service was rendered and
-- the day is an ABSENCE, which is not a tardiness deduction — absences are
-- already excluded from this sum. Below that the day is capped at seven hours,
-- exactly as applyUndertimeAbsenceRule does before the DTR prints it.
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
           rs.id AS pin_id
      FROM hris.attendance_logs l
      LEFT JOIN hris.schedules rs ON rs.id = l.schedule_id
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
        rec.no_time_reason
      ) d;

    -- 8 hours or more: the day is an absence, not an undertime deduction.
    IF v_undertime >= 480 THEN
      CONTINUE;
    END IF;

    v_total_mins := v_total_mins + v_late + LEAST(v_undertime, 420);
  END LOOP;

  RETURN v_total_mins;
END;
$$;

GRANT EXECUTE ON FUNCTION
  hris.compute_attendance_deduction_minutes(UUID, INT, INT)
TO authenticated, service_role;
