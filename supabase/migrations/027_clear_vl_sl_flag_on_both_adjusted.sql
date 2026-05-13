-- Migration 027: Auto-clear vl_sl_needs_manual_entry once HR has manually
-- adjusted BOTH the employee's VL and SL credits.
--
-- Replaces the previous TS-side logic in adjustLeaveCredit() which cleared the
-- flag the moment EITHER VL or SL was adjusted. The new rule: HR must seed
-- both VL and SL before the "needs manual entry" warning disappears, since the
-- legacy CSV reset both balances to zero.
--
-- Scope:
--   * Only `source = 'adjustment'` rows count (CSV imports / monthly accruals
--     do not, since they don't represent HR's reconciliation of the legacy
--     baseline).
--   * "Both adjusted" is evaluated all-time across years — once HR has put in
--     a real VL and SL number, the flag stays cleared, even when a new year
--     rolls over.
--
-- The trigger updates hris.employees.vl_sl_needs_manual_entry. Because RLS is
-- enabled on hris.employees, the function runs as SECURITY DEFINER so the row
-- write succeeds regardless of the calling role. The function owner
-- (`postgres`) has full access via the schema-wide GRANTs in migration 020.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.clear_vl_sl_flag_if_both_adjusted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_code TEXT;
  v_has_both BOOLEAN;
BEGIN
  -- Only manual adjustments are eligible.
  IF NEW.source <> 'adjustment' THEN
    RETURN NEW;
  END IF;

  -- Resolve this row's leave-type code; bail unless it's VL or SL.
  SELECT lt.code
    INTO v_code
    FROM hris.leave_types lt
   WHERE lt.id = NEW.leave_type_id;

  IF v_code IS NULL OR v_code NOT IN ('VL', 'SL') THEN
    RETURN NEW;
  END IF;

  -- Cheap exit: only do work if the flag is currently true.
  PERFORM 1
    FROM hris.employees e
   WHERE e.id = NEW.employee_id
     AND e.vl_sl_needs_manual_entry = true;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Has this employee accumulated at least one 'adjustment' row for BOTH
  -- VL and SL across all years?
  SELECT COUNT(DISTINCT lt.code) = 2
    INTO v_has_both
    FROM hris.leave_credit_accruals a
    JOIN hris.leave_types lt ON lt.id = a.leave_type_id
   WHERE a.employee_id = NEW.employee_id
     AND a.source       = 'adjustment'
     AND lt.code IN ('VL', 'SL');

  IF v_has_both THEN
    UPDATE hris.employees
       SET vl_sl_needs_manual_entry = false
     WHERE id = NEW.employee_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_vl_sl_flag_if_both_adjusted
  ON hris.leave_credit_accruals;

CREATE TRIGGER trg_clear_vl_sl_flag_if_both_adjusted
  AFTER INSERT ON hris.leave_credit_accruals
  FOR EACH ROW
  EXECUTE FUNCTION hris.clear_vl_sl_flag_if_both_adjusted();

COMMENT ON FUNCTION hris.clear_vl_sl_flag_if_both_adjusted() IS
  'Clears employees.vl_sl_needs_manual_entry when an adjustment row brings the employee to having at least one manual adjustment for BOTH VL and SL (any year). See migration 027.';

-- One-time backfill: clear the flag for any employee who already meets the
-- "both adjusted" condition before this trigger existed.
UPDATE hris.employees e
   SET vl_sl_needs_manual_entry = false
 WHERE e.vl_sl_needs_manual_entry = true
   AND (
     SELECT COUNT(DISTINCT lt.code)
       FROM hris.leave_credit_accruals a
       JOIN hris.leave_types lt ON lt.id = a.leave_type_id
      WHERE a.employee_id = e.id
        AND a.source       = 'adjustment'
        AND lt.code IN ('VL', 'SL')
   ) = 2;

-- Refresh the column comment now that the lifecycle has changed.
COMMENT ON COLUMN hris.employees.vl_sl_needs_manual_entry IS
  'True when VL/SL was reset to zero (employee not in the legacy CSV import) and HR has not yet seeded the manual baseline. Cleared by trigger trg_clear_vl_sl_flag_if_both_adjusted once HR has recorded a manual adjustment for BOTH VL and SL (any year).';
