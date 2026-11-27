-- Migration 113: a closed month is charged to VL on the 8th, not the 1st.
--
-- Migration 108 stopped charging tardy/undertime for the month in progress and
-- charged it once the month closed. Employees still file corrections for the
-- month just ended during the first days of the next one, so the charge now
-- waits for those 7 days: November is deducted on December 8 (Asia/Manila).
--
-- A month stays "open" (0 minutes, source 'open_month') until 7 full days of
-- the following month have passed. The daily cron (migration 108) already
-- recomputes the previous month every day, so it charges it on the 8th with no
-- schedule change. Nothing posted so far changes: on the day this was written
-- (2026-11-27) the only open month is November, as before.

SET search_path TO hris, public, auth, extensions;

-- The first day of the earliest month that is still open as of p_now.
-- Kept separate, with p_now as a parameter, so it can be tested on fixed dates.
CREATE OR REPLACE FUNCTION hris.attendance_deduction_open_from(
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', (p_now AT TIME ZONE 'Asia/Manila') - INTERVAL '7 days')::DATE;
$$;

-- Same body as 108 except the open-month test.
CREATE OR REPLACE FUNCTION hris.attendance_deduction_month_minutes(
  p_employee_id UUID,
  p_year INT,
  p_month INT,
  OUT minutes INT,
  OUT source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  -- Still in progress, in its 7-day correction grace, or in the future.
  IF v_start >= hris.attendance_deduction_open_from(now()) THEN
    minutes := 0;
    source  := 'open_month';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM hris.attendance_logs al
     WHERE al.employee_id = p_employee_id
       AND al.date BETWEEN v_start AND v_end
  ) THEN
    minutes := hris.compute_attendance_deduction_minutes(p_employee_id, p_year, p_month);
    source  := 'dtr';
    RETURN;
  END IF;

  SELECT x.minutes INTO minutes
    FROM hris.external_undertime x
   WHERE x.employee_id = p_employee_id
     AND x.year = p_year
     AND x.month = p_month
     AND x.status = 'apply';
  IF FOUND THEN
    source := 'external';
    RETURN;
  END IF;

  minutes := 0;
  source  := 'none';
END;
$$;
