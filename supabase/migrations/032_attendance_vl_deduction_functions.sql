-- Migration 032: Tardy/Undertime → VL auto-deduction functions.
--
-- Two PL/pgSQL functions:
--
--   hris.compute_attendance_deduction_minutes(p_employee_id, p_year, p_month)
--     Returns the total tardy + undertime minutes the employee racked up
--     during the month, computed against the employee's assigned work
--     schedule (defaults to 08:00–12:00 / 13:00–17:00 if none). The math
--     mirrors src/lib/attendance-schedule.ts so the DTR display and this
--     deduction always agree.
--
--   hris.apply_attendance_vl_deduction(p_year, p_month, p_employee_id?)
--     For each affected employee (one or all attendance_included plantilla
--     actives), computes the required VL deduction in days (mins / 480),
--     reads the sum of any existing 'attendance_deduction' rows for the
--     same (employee, leave_type=VL, year, month), and posts the DIFFERENCE
--     as a new ledger row. Result: cumulative posted = required, audit
--     trail preserved. Returns counts for cron logging.

SET search_path TO hris, public, auth, extensions;

-- Returns total tardy + undertime minutes for an employee over a month,
-- using the assigned schedule (or default).
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
  v_time_in     TIME;
  v_time_out    TIME;
  v_crosses     BOOLEAN;
  v_start       DATE;
  v_end         DATE;
  v_total_mins  INT := 0;
  rec           RECORD;
  v_sched_in    TIMESTAMP;
  v_sched_out   TIMESTAMP;
  v_late        INT;
  v_undertime   INT;
BEGIN
  -- Resolve schedule (fallback to default 8–5).
  SELECT s.time_in, s.time_out
    INTO v_time_in, v_time_out
    FROM hris.employees e
    LEFT JOIN hris.schedules s ON s.id = e.schedule_id
    WHERE e.id = p_employee_id;

  IF v_time_in IS NULL THEN v_time_in := TIME '08:00'; END IF;
  IF v_time_out IS NULL THEN v_time_out := TIME '17:00'; END IF;

  v_crosses := (v_time_out <= v_time_in);

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR rec IN
    SELECT date, time_in_am, time_out_pm, is_absent
      FROM hris.attendance_logs
      WHERE employee_id = p_employee_id
        AND date BETWEEN v_start AND v_end
        AND COALESCE(is_absent, false) = false
  LOOP
    -- Scheduled in is at duty date + time_in (always).
    v_sched_in := (rec.date::timestamp) + v_time_in;

    -- Scheduled out is on the next day if the shift crosses midnight.
    IF v_crosses THEN
      v_sched_out := ((rec.date + 1)::timestamp) + v_time_out;
    ELSE
      v_sched_out := (rec.date::timestamp) + v_time_out;
    END IF;

    -- Late: positive minutes the actual clock-in was after scheduled in.
    IF rec.time_in_am IS NOT NULL THEN
      v_late := GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (rec.time_in_am AT TIME ZONE 'Asia/Manila' - v_sched_in)) / 60.0)::INT
      );
    ELSE
      v_late := 0;
    END IF;

    -- Undertime: positive minutes the actual clock-out was before scheduled out.
    IF rec.time_out_pm IS NOT NULL THEN
      v_undertime := GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (v_sched_out - rec.time_out_pm AT TIME ZONE 'Asia/Manila')) / 60.0)::INT
      );
    ELSE
      v_undertime := 0;
    END IF;

    v_total_mins := v_total_mins + v_late + v_undertime;
  END LOOP;

  RETURN v_total_mins;
END;
$$;


-- Posts the VL delta row for one employee for one month. Internal helper
-- used by apply_attendance_vl_deduction.
CREATE OR REPLACE FUNCTION hris.post_attendance_vl_deduction_for_employee(
  p_employee_id UUID,
  p_year INT,
  p_month INT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_vl_id        UUID;
  v_total_mins   INT;
  v_required     NUMERIC(8,3);   -- days, negative (a deduction)
  v_already      NUMERIC(8,3);
  v_delta        NUMERIC(8,3);
BEGIN
  -- Resolve VL leave_type id once.
  SELECT id INTO v_vl_id FROM hris.leave_types WHERE code = 'VL' LIMIT 1;
  IF v_vl_id IS NULL THEN
    RETURN 0;  -- no VL type configured; nothing to do
  END IF;

  v_total_mins := hris.compute_attendance_deduction_minutes(p_employee_id, p_year, p_month);
  -- 0.125 days per hour = mins / 480, rounded to 3 decimals, NEGATIVE
  v_required := ROUND(-1.0 * v_total_mins / 480.0, 3);

  -- Sum existing attendance_deduction rows for this (emp, year, month).
  SELECT COALESCE(SUM(amount), 0) INTO v_already
    FROM hris.leave_credit_accruals
    WHERE employee_id = p_employee_id
      AND leave_type_id = v_vl_id
      AND year = p_year
      AND month = p_month
      AND source = 'attendance_deduction';

  v_delta := ROUND(v_required - v_already, 3);
  IF v_delta = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO hris.leave_credit_accruals
    (employee_id, leave_type_id, year, month, amount, source, notes)
  VALUES (
    p_employee_id,
    v_vl_id,
    p_year,
    p_month,
    v_delta,
    'attendance_deduction',
    format(
      'Tardy/undertime auto-deduction for %s-%s (total %s min, delta %s d)',
      p_year, lpad(p_month::text, 2, '0'), v_total_mins, v_delta
    )
  );

  RETURN v_delta;
END;
$$;


-- Applies the deduction to plantilla actives who actually have attendance
-- logs in the target month (this is how an employee "opts in" — no flag is
-- read; the presence of logs is the signal). Pass p_employee_id = NULL to
-- run for everyone (cron path).
CREATE OR REPLACE FUNCTION hris.apply_attendance_vl_deduction(
  p_year INT,
  p_month INT,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  year_v      INT,
  month_v     INT,
  employees_v INT,
  posts_v     INT,
  total_days  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  rec        RECORD;
  v_d        NUMERIC(8,3);
  v_emp      INT := 0;
  v_pst      INT := 0;
  v_td       NUMERIC(10,3) := 0;
  v_start    DATE := make_date(p_year, p_month, 1);
  v_end      DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  FOR rec IN
    SELECT e.id
      FROM hris.employees e
      WHERE e.employment_type = 'plantilla'
        AND e.status = 'active'
        AND (p_employee_id IS NULL OR e.id = p_employee_id)
        AND EXISTS (
          SELECT 1
            FROM hris.attendance_logs al
            WHERE al.employee_id = e.id
              AND al.date BETWEEN v_start AND v_end
        )
  LOOP
    v_emp := v_emp + 1;
    v_d := hris.post_attendance_vl_deduction_for_employee(rec.id, p_year, p_month);
    IF v_d <> 0 THEN
      v_pst := v_pst + 1;
      v_td := v_td + v_d;
    END IF;
  END LOOP;

  RETURN QUERY SELECT p_year, p_month, v_emp, v_pst, v_td;
END;
$$;


GRANT EXECUTE ON FUNCTION
  hris.compute_attendance_deduction_minutes(UUID, INT, INT),
  hris.post_attendance_vl_deduction_for_employee(UUID, INT, INT),
  hris.apply_attendance_vl_deduction(INT, INT, UUID)
TO authenticated, service_role;
