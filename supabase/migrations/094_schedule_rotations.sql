-- Migration 094: Rotations, per-date schedule overrides, rest days by schedule.
--
-- Until now an employee had ONE schedule (employees.schedule_id) for every day,
-- Saturday and Sunday were always rest days, and the only per-day exception was
-- a schedule pinned on an attendance row by an approved correction. That could
-- not describe an employee who works days one week and nights the next, a
-- rostered Saturday, or a night worker whose weekend is Friday–Saturday.
--
--   schedule_rotations          reusable templates, a cycle of 1–4 weeks
--   schedule_rotation_days      week × ISO weekday → a schedule, or REST (NULL)
--   employee_rotation_assignments
--                               employee → rotation from an effective date, with
--                               the week of the cycle that date's week starts on;
--                               history is kept, the latest in effect applies, and
--                               a NULL rotation returns the employee to their
--                               base schedule
--   schedule_overrides          one employee, one date: a schedule or a rest day
--
-- Which schedule applies, most specific first (resolveDaySchedule in
-- src/lib/schedule-resolver.ts; hris.resolve_day_schedule mirrors it):
--   1. a correction's pin on that day's attendance row (always a working day);
--   2. the per-date override;
--   3. the rotation in effect;
--   4. the employee's base schedule (or the org default) Monday to Friday,
--      Saturday and Sunday rest — exactly the behaviour before this migration.
--
-- A REST day owes nothing and is never an absence; a rostered Saturday is owed
-- like any workday. hris.day_late_undertime gains p_rest_day (NULL keeps the
-- Saturday/Sunday default for callers that do not resolve a schedule), and the
-- VL deduction resolves each day's schedule and rest day through
-- hris.resolve_day_schedule.
--
-- No employee has a rotation or override when this runs, so every existing
-- day resolves exactly as before and nothing needs recomputing.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.schedule_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  cycle_weeks INT NOT NULL CHECK (cycle_weeks BETWEEN 1 AND 4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hris.schedule_rotation_days (
  rotation_id UUID NOT NULL REFERENCES hris.schedule_rotations(id) ON DELETE CASCADE,
  week_no INT NOT NULL CHECK (week_no BETWEEN 1 AND 4),
  iso_weekday INT NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  -- NULL is REST. A schedule in use by a rotation cannot be deleted.
  schedule_id UUID REFERENCES hris.schedules(id) ON DELETE RESTRICT,
  PRIMARY KEY (rotation_id, week_no, iso_weekday)
);

CREATE TABLE IF NOT EXISTS hris.employee_rotation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  -- NULL ends a rotation: the base schedule applies again from effective_from.
  rotation_id UUID REFERENCES hris.schedule_rotations(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  start_week INT NOT NULL DEFAULT 1 CHECK (start_week BETWEEN 1 AND 4),
  created_by UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);

CREATE TABLE IF NOT EXISTS hris.schedule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  schedule_id UUID REFERENCES hris.schedules(id) ON DELETE RESTRICT,
  is_rest_day BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_by UUID REFERENCES hris.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date),
  CONSTRAINT schedule_overrides_kind_chk CHECK (
    (is_rest_day AND schedule_id IS NULL)
    OR (NOT is_rest_day AND schedule_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_rotation_assignments_rotation
  ON hris.employee_rotation_assignments(rotation_id);

-- Read and written only by server actions on the admin client.
ALTER TABLE hris.schedule_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.schedule_rotation_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.employee_rotation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.schedule_overrides ENABLE ROW LEVEL SECURITY;

-- The schedule and rest day for one employee on one date, steps 2–4 above.
-- Step 1 (a correction's pin) lives on the attendance row and is applied by
-- the caller, as compute_attendance_deduction_minutes does below.
CREATE OR REPLACE FUNCTION hris.resolve_day_schedule(
  p_employee_id UUID,
  p_date DATE,
  OUT schedule_id UUID,
  OUT time_in TIME,
  OUT time_out TIME,
  OUT break_start TIME,
  OUT break_end TIME,
  OUT is_rest_day BOOLEAN,
  OUT source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_base   hris.schedules%ROWTYPE;
  v_s      hris.schedules%ROWTYPE;
  v_ov     hris.schedule_overrides%ROWTYPE;
  v_asg    hris.employee_rotation_assignments%ROWTYPE;
  v_cycle  INT;
  v_week   INT;
  v_sid    UUID;
BEGIN
  SELECT s.* INTO v_base
    FROM hris.employees e
    JOIN hris.schedules s ON s.id = e.schedule_id
   WHERE e.id = p_employee_id;
  IF v_base.id IS NULL THEN
    SELECT d.* INTO v_base FROM hris.schedules d WHERE d.is_default LIMIT 1;
  END IF;
  IF v_base.id IS NULL THEN
    v_base.time_in := TIME '08:00'; v_base.time_out := TIME '17:00';
    v_base.break_start := TIME '12:00'; v_base.break_end := TIME '13:00';
  END IF;

  -- Punches on a rest day are read against the base hours.
  schedule_id := v_base.id; time_in := v_base.time_in; time_out := v_base.time_out;
  break_start := v_base.break_start; break_end := v_base.break_end;

  SELECT o.* INTO v_ov
    FROM hris.schedule_overrides o
   WHERE o.employee_id = p_employee_id AND o.date = p_date;
  IF FOUND THEN
    IF v_ov.is_rest_day THEN
      is_rest_day := TRUE; source := 'override';
      RETURN;
    END IF;
    SELECT s.* INTO v_s FROM hris.schedules s WHERE s.id = v_ov.schedule_id;
    IF FOUND THEN
      schedule_id := v_s.id; time_in := v_s.time_in; time_out := v_s.time_out;
      break_start := v_s.break_start; break_end := v_s.break_end;
      is_rest_day := FALSE; source := 'override';
      RETURN;
    END IF;
  END IF;

  SELECT a.* INTO v_asg
    FROM hris.employee_rotation_assignments a
   WHERE a.employee_id = p_employee_id AND a.effective_from <= p_date
   ORDER BY a.effective_from DESC
   LIMIT 1;
  IF FOUND AND v_asg.rotation_id IS NOT NULL THEN
    SELECT r.cycle_weeks INTO v_cycle
      FROM hris.schedule_rotations r WHERE r.id = v_asg.rotation_id;
    -- Weeks run Monday–Sunday (date_trunc('week') is the ISO Monday), counted
    -- from the effective date's week, shifted by start_week.
    v_week := (
      (v_asg.start_week - 1
        + (date_trunc('week', p_date)::date
           - date_trunc('week', v_asg.effective_from)::date) / 7)
      % v_cycle + v_cycle
    ) % v_cycle + 1;
    SELECT d.schedule_id INTO v_sid
      FROM hris.schedule_rotation_days d
     WHERE d.rotation_id = v_asg.rotation_id
       AND d.week_no = v_week
       AND d.iso_weekday = EXTRACT(ISODOW FROM p_date)::INT;
    IF v_sid IS NULL THEN
      is_rest_day := TRUE; source := 'rotation';
      RETURN;
    END IF;
    SELECT s.* INTO v_s FROM hris.schedules s WHERE s.id = v_sid;
    schedule_id := v_s.id; time_in := v_s.time_in; time_out := v_s.time_out;
    break_start := v_s.break_start; break_end := v_s.break_end;
    is_rest_day := FALSE; source := 'rotation';
    RETURN;
  END IF;

  is_rest_day := hris.is_rest_day(p_date);
  source := 'base';
END;
$$;

REVOKE ALL ON FUNCTION hris.resolve_day_schedule(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hris.resolve_day_schedule(UUID, DATE) TO authenticated, service_role;

-- day_late_undertime gains p_rest_day. A new parameter changes the signature,
-- so the 16-argument version is dropped first; calls that omit p_rest_day keep
-- the Saturday/Sunday default.
DROP FUNCTION IF EXISTS hris.day_late_undertime(
  DATE, TIME, TIME, TIME, TIME,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN
);

CREATE FUNCTION hris.day_late_undertime(
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
  TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

-- The VL auto-deduction, scoring each day against the schedule and rest day
-- resolve_day_schedule gives it. A correction's pin still wins.
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
  v_start       DATE;
  v_end         DATE;
  v_total_mins  INT := 0;
  rec           RECORD;
  v_day         RECORD;
  v_time_in     TIME;
  v_time_out    TIME;
  v_break_start TIME;
  v_break_end   TIME;
  v_rest        BOOLEAN;
  v_late        INT;
  v_undertime   INT;
BEGIN
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
    IF rec.pin_id IS NOT NULL THEN
      v_time_in := rec.pin_time_in; v_time_out := rec.pin_time_out;
      v_break_start := rec.pin_break_start; v_break_end := rec.pin_break_end;
      v_rest := FALSE;
    ELSE
      SELECT * INTO v_day FROM hris.resolve_day_schedule(p_employee_id, rec.date);
      v_time_in := v_day.time_in; v_time_out := v_day.time_out;
      v_break_start := v_day.break_start; v_break_end := v_day.break_end;
      v_rest := v_day.is_rest_day;
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
        hris.holiday_excuses_pm(rec.holiday_type),
        v_rest
      ) d;

    v_total_mins := v_total_mins + v_late + LEAST(v_undertime, 420);
  END LOOP;

  RETURN v_total_mins;
END;
$$;
