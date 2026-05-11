-- Migration 025: Track paid vs leave-without-pay days per application.
--
-- A leave application may now exceed the employee's available credits; the
-- excess is leave without pay (LWOP). To keep the credit ledger accurate, we
-- record how many of the applied days actually consume credits in a new
-- `days_with_pay` column, then re-derive `leave_credit_balances` from it
-- instead of from the raw `days_applied`.
SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.leave_applications
  ADD COLUMN IF NOT EXISTS days_with_pay NUMERIC(8,3);

-- Backfill: existing rows are assumed to have been fully paid (the old code
-- rejected applications that exceeded balance, so this matches reality).
UPDATE hris.leave_applications
  SET days_with_pay = days_applied
  WHERE days_with_pay IS NULL;

ALTER TABLE hris.leave_applications
  ALTER COLUMN days_with_pay SET NOT NULL,
  ALTER COLUMN days_with_pay SET DEFAULT 0;

-- Rebuild the balance view to count only the paid portion.
DROP VIEW IF EXISTS hris.leave_credit_balances;

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
  SELECT SUM(la.days_with_pay) AS used_credits
  FROM hris.leave_applications la
  WHERE la.employee_id = lc.employee_id
    AND la.leave_type_id = lc.leave_type_id
    AND la.status = 'approved'
    AND EXTRACT(YEAR FROM la.start_date)::INT = lc.year
) used ON true;

COMMENT ON VIEW hris.leave_credit_balances IS
  'Derived balance per (employee, leave_type, year): total credits minus approved leave_applications.days_with_pay (excludes LWOP days). 3-decimal precision.';

ALTER VIEW hris.leave_credit_balances SET (security_barrier = true);

GRANT SELECT ON hris.leave_credit_balances TO authenticated, anon, service_role;
