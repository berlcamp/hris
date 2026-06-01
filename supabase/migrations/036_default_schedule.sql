-- Migration 036: Mark a schedule as the system default.
--
-- Adds schedules.is_default so the org-wide fallback (used for employees with
-- no schedule_id assigned) is a real, editable row instead of a hardcoded
-- constant. The "Regular 8:00 AM – 5:00 PM" shift (08:00–17:00, 12:00–13:00
-- lunch) is flagged as the default. A partial unique index guarantees at most
-- one default at a time.
--
-- compute_attendance_deduction_minutes is updated to fall back to the default
-- row's hours (then to 08:00/17:00 only if no default exists at all). The
-- AT TIME ZONE 'UTC' fix from migration 035 is preserved.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.schedules
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- At most one schedule may be the default.
CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_default_idx
  ON hris.schedules (is_default)
  WHERE is_default;

-- Flag the standard government office hours as the default (create it if a
-- prior admin deleted the seed row).
INSERT INTO hris.schedules
  (name, time_in, time_out, break_start, break_end, notes, is_default)
VALUES
  ('Regular 8:00 AM – 5:00 PM', '08:00', '17:00', '12:00', '13:00',
   'Standard government office hours with one-hour lunch break.', true)
ON CONFLICT (name) DO UPDATE SET is_default = true;

-- Recompute fallback now resolves the default schedule row before the
-- hardcoded last resort.
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
  -- Employee's assigned schedule.
  SELECT s.time_in, s.time_out
    INTO v_time_in, v_time_out
    FROM hris.employees e
    LEFT JOIN hris.schedules s ON s.id = e.schedule_id
    WHERE e.id = p_employee_id;

  -- No assigned schedule → the org default row.
  IF v_time_in IS NULL THEN
    SELECT d.time_in, d.time_out
      INTO v_time_in, v_time_out
      FROM hris.schedules d
      WHERE d.is_default
      LIMIT 1;
  END IF;

  -- Last resort if no default row exists.
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
    -- AT TIME ZONE 'UTC' reads the stored wall-clock digits (= Manila time),
    -- matching how the DTR display interprets the same value.
    IF rec.time_in_am IS NOT NULL THEN
      v_late := GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (rec.time_in_am AT TIME ZONE 'UTC' - v_sched_in)) / 60.0)::INT
      );
    ELSE
      v_late := 0;
    END IF;

    -- Undertime: positive minutes the actual clock-out was before scheduled out.
    IF rec.time_out_pm IS NOT NULL THEN
      v_undertime := GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (v_sched_out - rec.time_out_pm AT TIME ZONE 'UTC')) / 60.0)::INT
      );
    ELSE
      v_undertime := 0;
    END IF;

    v_total_mins := v_total_mins + v_late + v_undertime;
  END LOOP;

  RETURN v_total_mins;
END;
$$;

GRANT EXECUTE ON FUNCTION
  hris.compute_attendance_deduction_minutes(UUID, INT, INT)
TO authenticated, service_role;
