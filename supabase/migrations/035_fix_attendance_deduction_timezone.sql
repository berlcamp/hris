-- Migration 035: Fix the timezone used when computing tardy/undertime minutes
-- for the VL auto-deduction.
--
-- Bug: hris.compute_attendance_deduction_minutes (migration 032) converted the
-- stored punch with `AT TIME ZONE 'Asia/Manila'`. But attendance_logs stores
-- the device's Manila wall-clock *digits* as a naive timestamp with a +00
-- offset (the importer and manual entry both write "YYYY-MM-DDTHH:MM:00" with
-- no zone, which Postgres records as ...+00). So a 07:54 Manila punch is stored
-- as 07:54+00 — NOT 23:54Z. Applying `AT TIME ZONE 'Asia/Manila'` then shifted
-- it forward 8 hours (07:54 -> 15:54), massively inflating late/undertime and
-- disagreeing with the DTR, which reads the literal HH:MM (= the Manila time).
--
-- Fix: read the stored wall-clock as-is with `AT TIME ZONE 'UTC'`, which yields
-- the same HH:MM the DTR shows. The schedule anchors (v_sched_in/out) are plain
-- timestamps built from the duty date, so both sides of the subtraction are now
-- the same Manila wall-clock basis. This makes the VL deduction agree with the
-- DTR display (src/lib/attendance-schedule.ts) exactly.
--
-- Only compute_attendance_deduction_minutes changes; the post and preview
-- functions (032/033) delegate to it, so they inherit the fix automatically.

SET search_path TO hris, public, auth, extensions;

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
