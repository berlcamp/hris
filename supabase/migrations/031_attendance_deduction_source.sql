-- Migration 031: Ledger source for tardy/undertime VL deduction.
--
-- Extends the leave_credit_accruals.source CHECK constraint to accept a new
-- 'attendance_deduction' value. These rows are negative VL deltas (or
-- positive corrections) posted by the month-end cron and by manual
-- attendance edits. Multiple rows per (employee, year, month) are allowed
-- so the audit trail of corrections is preserved.
--
-- Inclusion in the deduction is implicit: an employee with no attendance_logs
-- rows in a month is skipped by both the deduction and the DTR/report views.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.leave_credit_accruals
  DROP CONSTRAINT IF EXISTS leave_credit_accruals_source_check;

ALTER TABLE hris.leave_credit_accruals
  ADD CONSTRAINT leave_credit_accruals_source_check
  CHECK (
    source IN (
      'monthly_accrual',
      'csv_import',
      'adjustment',
      'carryover',
      'seed',
      'attendance_deduction'
    )
  );

CREATE INDEX IF NOT EXISTS idx_leave_credit_accruals_att_dedux
  ON hris.leave_credit_accruals(employee_id, leave_type_id, year, month)
  WHERE source = 'attendance_deduction';
