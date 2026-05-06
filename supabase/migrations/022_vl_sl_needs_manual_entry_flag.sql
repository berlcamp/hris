-- Migration 022: Flag for employees whose VL/SL needs manual HR entry.
--
-- After the legacy CSV import, employees not present in the file had their
-- VL/SL ledger reset to zero. This column flags those employees so the UI can
-- surface a warning banner on the leave-credits tab and a badge on
-- /leaves/credits, prompting HR to manually enter the correct values.
--
-- Lifecycle:
--   * Set to true by the "Reset & flag missing-from-CSV employees" admin
--     action on /leaves/credits.
--   * Auto-cleared by adjustLeaveCredit() when HR enters an adjustment for
--     either VL or SL.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS vl_sl_needs_manual_entry BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_vl_sl_needs_manual_entry
  ON hris.employees(vl_sl_needs_manual_entry)
  WHERE vl_sl_needs_manual_entry = true;

COMMENT ON COLUMN hris.employees.vl_sl_needs_manual_entry IS
  'True when VL/SL was reset to zero (employee not in the legacy CSV import) and HR has not yet entered the manual baseline. Cleared by adjustLeaveCredit() on a VL or SL adjustment.';
