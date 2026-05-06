-- Migration 016: Make `leave_credits` ledger-only; compute used/balance from applications.
--
-- Changes:
--   1. Add `leave_types.annual_credits` (NUMERIC, NULL = not auto-accruing). This becomes
--      the single source of truth for monthly accrual rates. Seed VL/SL = 15.
--   2. Drop the materialized `used_credits` column (and its derived `balance`) on
--      `leave_credits`. The table now stores only the accrued total per (employee,
--      leave_type, year), which is the SUM of `leave_credit_accruals.amount`.
--   3. Create the view `hris.leave_credit_balances` exposing `used_credits` and
--      `balance` derived from approved `leave_applications` for the same year.
--
-- App reads should target the view (`leave_credit_balances`); writes still go to
-- the underlying `leave_credits` table via `recomputeLeaveCreditTotal`.

SET search_path TO hris, public, auth, extensions;

-- ── 1. annual_credits on leave_types ──────────────────────────────────────

ALTER TABLE hris.leave_types
  ADD COLUMN IF NOT EXISTS annual_credits NUMERIC(6,2);

COMMENT ON COLUMN hris.leave_types.annual_credits IS
  'Annual accrual amount for auto-accruing types (VL/SL). NULL means not auto-accruing. Per-month amount is annual_credits / 12.';

UPDATE hris.leave_types SET annual_credits = 15 WHERE code IN ('VL', 'SL') AND annual_credits IS NULL;

-- max_credits is meaningless for accruing types; null it out so there is one
-- knob per concept.
UPDATE hris.leave_types SET max_credits = NULL WHERE code IN ('VL', 'SL');

-- ── 2. Drop generated balance + used_credits column ────────────────────────

-- Drop generated column first because it depends on used_credits.
ALTER TABLE hris.leave_credits DROP COLUMN IF EXISTS balance;
ALTER TABLE hris.leave_credits DROP COLUMN IF EXISTS used_credits;

-- ── 3. View that re-exposes used_credits and balance ───────────────────────

CREATE OR REPLACE VIEW hris.leave_credit_balances AS
SELECT
  lc.id,
  lc.employee_id,
  lc.leave_type_id,
  lc.year,
  lc.total_credits,
  COALESCE(used.used_credits, 0)::NUMERIC(6,2) AS used_credits,
  (lc.total_credits - COALESCE(used.used_credits, 0))::NUMERIC(6,2) AS balance
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
  'Derived balance per (employee, leave_type, year): total from accrual ledger minus approved leave_applications.days_applied for that year.';

-- View RLS: Postgres views inherit security from their base tables, but we
-- recreate the role-based filtering by relying on the existing leave_credits
-- and leave_applications RLS. The admin client (used by server actions)
-- bypasses RLS anyway. For direct user-scoped reads we add a security
-- barrier hint so the planner doesn't push down predicates that would leak
-- rows.
ALTER VIEW hris.leave_credit_balances SET (security_barrier = true);

-- Permissions: grant SELECT to the same roles that can read the underlying
-- table. (Supabase pre-grants to `authenticated`, `anon`, `service_role`.)
GRANT SELECT ON hris.leave_credit_balances TO authenticated, anon, service_role;
