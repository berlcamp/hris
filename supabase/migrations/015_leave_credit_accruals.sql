-- Migration 015: Leave Credit Accrual Ledger
-- Adds an append-only ledger of every change to a leave_credits row.
-- Each row in leave_credits is the SUM of its accrual ledger rows for total_credits
-- (used_credits is still mutated by leave application approvals).
--
-- Sources:
--   monthly_accrual : +1.25 (or settings-driven amount) per VL/SL per month
--   csv_import      : a one-shot starting balance from the bulk import
--   adjustment      : manual HR adjustment (positive or negative)
--   carryover       : end-of-year carry from prior cumulative balance
--   seed            : initial provisioning for non-accruing types (SPL, FL, etc.)
--
-- Idempotency: monthly_accrual is unique per (employee_id, leave_type_id, year, month).
-- Other sources allow multiple rows per (year, month) since they are one-off events.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.leave_credit_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hris.employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES hris.leave_types(id),
  year INT NOT NULL,
  month INT CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  amount NUMERIC(6,2) NOT NULL,
  source TEXT NOT NULL CHECK (
    source IN ('monthly_accrual', 'csv_import', 'adjustment', 'carryover', 'seed')
  ),
  notes TEXT,
  created_by UUID REFERENCES hris.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_credit_accruals_employee
  ON hris.leave_credit_accruals(employee_id, leave_type_id, year);

CREATE INDEX IF NOT EXISTS idx_leave_credit_accruals_period
  ON hris.leave_credit_accruals(year, month);

-- Enforce one monthly_accrual row per (employee, leave_type, year, month).
-- Other sources may have multiple rows per period (e.g. several adjustments).
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_credit_accruals_monthly
  ON hris.leave_credit_accruals(employee_id, leave_type_id, year, month)
  WHERE source = 'monthly_accrual';

-- Enforce a single csv_import row per (employee, leave_type, year). Re-imports
-- should DELETE the old row first to keep total_credits = SUM(amount) consistent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_credit_accruals_csv_import
  ON hris.leave_credit_accruals(employee_id, leave_type_id, year)
  WHERE source = 'csv_import';

-- RLS: same access pattern as leave_credits.
ALTER TABLE hris.leave_credit_accruals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_leave_credit_accruals" ON hris.leave_credit_accruals
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_leave_credit_accruals" ON hris.leave_credit_accruals
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "employee_own_leave_credit_accruals" ON hris.leave_credit_accruals
  FOR SELECT USING (employee_id = hris.get_employee_id());
