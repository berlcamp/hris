-- Migration 033: Read-only preview of the month-end VL deduction.
--
-- hris.preview_attendance_vl_deduction(year, month, employee_id?)
-- Returns one row per candidate employee (plantilla active with attendance
-- logs in the target month) showing:
--   total_minutes       — computed tardy + undertime
--   required_days       — what the ledger total should be (negative)
--   already_posted_days — sum of existing 'attendance_deduction' rows
--   delta_days          — required - already_posted; this is what
--                         post_attendance_vl_deduction_for_employee
--                         WILL insert when run.
--
-- The math is identical to the post path; this function is purely read-only
-- so the UI can show HR what's about to change before they confirm.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.preview_attendance_vl_deduction(
  p_year INT,
  p_month INT,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  employee_id          UUID,
  total_minutes        INT,
  required_days        NUMERIC,
  already_posted_days  NUMERIC,
  delta_days           NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_vl_id   UUID;
  v_start   DATE := make_date(p_year, p_month, 1);
  v_end     DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  SELECT id INTO v_vl_id FROM hris.leave_types WHERE code = 'VL' LIMIT 1;
  IF v_vl_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id,
           hris.compute_attendance_deduction_minutes(e.id, p_year, p_month) AS mins
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
  ),
  posted AS (
    SELECT lca.employee_id,
           COALESCE(SUM(lca.amount), 0)::NUMERIC AS days
      FROM hris.leave_credit_accruals lca
      WHERE lca.leave_type_id = v_vl_id
        AND lca.year  = p_year
        AND lca.month = p_month
        AND lca.source = 'attendance_deduction'
      GROUP BY lca.employee_id
  )
  SELECT
    c.id                                                           AS employee_id,
    c.mins                                                         AS total_minutes,
    ROUND(-1.0 * c.mins / 480.0, 3)                                AS required_days,
    COALESCE(p.days, 0)                                            AS already_posted_days,
    ROUND(ROUND(-1.0 * c.mins / 480.0, 3) - COALESCE(p.days, 0), 3) AS delta_days
  FROM candidates c
  LEFT JOIN posted p ON p.employee_id = c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION hris.preview_attendance_vl_deduction(INT, INT, UUID)
  TO authenticated, service_role;
