-- Migration 021: Widen leave-credit precision to 3 decimal places.
--
-- Originally the accrual ledger and leave_credits stored credits as
-- NUMERIC(6,2)/NUMERIC(5,2) — 2 decimal places. CSV imports with 3-decimal
-- values (e.g. -33.946 from legacy payroll exports) were silently rounded to
-- 2 decimals on insert, losing precision. This migration widens both columns
-- to NUMERIC(8,3) and re-creates the leave_credit_balances view to preserve
-- 3 decimals through the derived used/balance columns too.
--
-- Existing data values are preserved by the ALTER COLUMN TYPE; widening
-- precision is a non-destructive change in Postgres.

SET search_path TO hris, public, auth, extensions;

-- ── 1. Ledger amount ─────────────────────────────────────────────────────

ALTER TABLE hris.leave_credit_accruals
  ALTER COLUMN amount TYPE NUMERIC(8,3);

-- ── 2. leave_credits.total_credits ───────────────────────────────────────
-- The view depends on this column, so drop and recreate the view around it.

DROP VIEW IF EXISTS hris.leave_credit_balances;

ALTER TABLE hris.leave_credits
  ALTER COLUMN total_credits TYPE NUMERIC(8,3);

CREATE VIEW hris.leave_credit_balances AS
SELECT
  lc.id,
  lc.employee_id,
  lc.leave_type_id,
  lc.year,
  lc.total_credits,
  COALESCE(used.used_credits, 0)::NUMERIC(8,3) AS used_credits,
  (lc.total_credits - COALESCE(used.used_credits, 0))::NUMERIC(8,3) AS balance
FROM hris.leave_credits lc
LEFT JOIN LATERAL (
  SELECT SUM(la.days_applied) AS used_credits
  FROM hris.leave_applications la
  WHERE la.employee_id = lc.employee_id
    AND la.leave_type_id = lc.leave_type_id
    AND la.status = 'approved'
    AND EXTRACT(YEAR FROM la.start_date)::INT = lc.year
) used ON true;

COMMENT ON VIEW hris.leave_credit_balances IS
  'Derived balance per (employee, leave_type, year): total from accrual ledger minus approved leave_applications.days_applied for that year. 3-decimal precision.';

ALTER VIEW hris.leave_credit_balances SET (security_barrier = true);

GRANT SELECT ON hris.leave_credit_balances TO authenticated, anon, service_role;
