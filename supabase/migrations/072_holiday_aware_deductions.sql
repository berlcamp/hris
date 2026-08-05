-- Migration 072: the VL auto-deduction honours the holiday calendar
--
-- Until now hris.compute_attendance_deduction_minutes never looked at
-- hris.holidays. The DTR forgave a declared holiday's late/undertime at render
-- time and the ledger deducted it anyway, so the printed document and the leave
-- credits taken from the employee disagreed. Migration 071's
-- 'no_am_deductions' / 'no_pm_deductions' would have inherited that same split:
-- the DTR would print a clean day while the ledger still billed it.
--
-- Two changes:
--
--   1. hris.day_late_undertime gains p_excuse_am / p_excuse_pm, mirroring the
--      excuseAm / excusePm options dayLateUndertime already takes in
--      src/lib/attendance-schedule.ts. It stays IMMUTABLE — it cannot read a
--      table, so the CALLER resolves the holiday and passes the verdict.
--   2. compute_attendance_deduction_minutes joins hris.holidays per day and
--      passes those flags.
--
-- NOTE ON EXISTING FIGURES: this changes what the deduction function returns
-- for days that fall on ANY declared holiday, not only the new waiver types.
-- That is the point — it is the DTR's number. Already-posted ledger entries are
-- not rewritten here; hris.post_attendance_vl_deduction_for_employee posts the
-- DELTA between the computed requirement and what is already posted, so a month
-- recomputed after this migration self-corrects on its next run. A month whose
-- requirement DROPS posts a positive (crediting-back) delta by the same
-- mechanism.

SET search_path TO hris, public, auth, extensions;

-- ---------------------------------------------------------------------------
-- 0. The holiday -> excused-session rule, in SQL.
-- ---------------------------------------------------------------------------
-- The mirror of holidayExcusedSessions in src/lib/validations/holiday-schema.ts.
-- Split in two because a plpgsql OUT-pair cannot be inlined into a call the way
-- two scalar calls can. An unrecognised or NULL type excuses nothing, so a type
-- added to the CHECK without being added here is a visible no-op rather than a
-- silent waiver.
CREATE OR REPLACE FUNCTION hris.holiday_excuses_am(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT COALESCE(p_type IN ('full', 'half_am', 'no_am_deductions'), FALSE) $$;

CREATE OR REPLACE FUNCTION hris.holiday_excuses_pm(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT COALESCE(p_type IN ('full', 'half_pm', 'no_pm_deductions'), FALSE) $$;

GRANT EXECUTE ON FUNCTION hris.holiday_excuses_am(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hris.holiday_excuses_pm(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. day_late_undertime + p_excuse_am / p_excuse_pm
-- ---------------------------------------------------------------------------
-- The 14-argument form is DROPPED, not replaced: adding defaulted parameters
-- creates an OVERLOAD, and a 14-argument call would then match both and fail as
-- ambiguous. Dropping first leaves one function, which still accepts every
-- existing 14-argument call through the defaults.
DROP FUNCTION IF EXISTS hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  -- A whole session forgiven from OUTSIDE the row: a declared holiday covering
  -- that half of the day, or a no_*_deductions waiver. Distinct from the reason
  -- columns, which explain ONE punch on ONE employee's day.
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
  v_day_excused BOOLEAN;
  -- Day-level excuse OR the session's own external excuse. Every test below
  -- that used to read v_day_excused reads the matching one of these, which is
  -- exactly how dayLateUndertime treats its excuseAm / excusePm options.
  v_am_off      BOOLEAN;
  v_pm_off      BOOLEAN;
  -- The stored punches as Manila wall clock (see the TIMEZONE note in 070).
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
  v_am_off      := v_day_excused OR COALESCE(p_excuse_am, FALSE);
  v_pm_off      := v_day_excused OR COALESCE(p_excuse_pm, FALSE);

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
    IF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
      late_minutes := GREATEST(0, ROUND(
        EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
    END IF;

    IF v_pm_off OR p_reason_out_pm IS NOT NULL THEN
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
  v_am_excused := v_am_off
    OR p_reason_in_am IS NOT NULL OR p_reason_out_am IS NOT NULL;
  v_pm_excused := v_pm_off
    OR p_reason_in_pm IS NOT NULL OR p_reason_out_pm IS NOT NULL;

  -- --- morning ---
  IF NOT v_am_complete AND NOT v_am_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_am_off AND p_reason_in_am IS NULL AND w_in_am IS NOT NULL THEN
    late_minutes := GREATEST(0, ROUND(
      EXTRACT(EPOCH FROM (w_in_am - v_sched_in)) / 60.0)::INT);
  END IF;

  -- --- afternoon ---
  IF NOT v_pm_complete AND NOT v_pm_excused THEN
    undertime_minutes := undertime_minutes + hris.half_day_undertime_minutes();
  ELSIF NOT v_pm_off THEN
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

GRANT EXECUTE ON FUNCTION hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The deduction sum resolves each day's holiday.
-- ---------------------------------------------------------------------------
-- Unchanged from 070 apart from the hris.holidays join and the two flags. The
-- comments there on schedule resolution, the absence exclusion and the 7h/8h
-- cap still apply.
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
