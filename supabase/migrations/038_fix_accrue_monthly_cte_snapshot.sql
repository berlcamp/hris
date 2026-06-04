-- Migration 038: Fix accrue_monthly_leave_credits CTE snapshot-isolation bug.
--
-- Root cause: PostgreSQL CTEs share a snapshot. The `recomputed` CTE in the
-- original function used a scalar subquery SELECT SUM(amount) FROM
-- leave_credit_accruals which could NOT see the rows just inserted by the
-- `inserted` CTE in the same statement. It read only the pre-insert total
-- (e.g. the csv_import baseline of 47.153) and the subsequent upsert into
-- leave_credits wrote back the same unchanged value — silently a no-op.
--
-- Fix: drop `recomputed` entirely. Instead, pull the per-row amount from the
-- RETURNING clause of `inserted` (RETURNING data IS visible to subsequent
-- CTEs in the same statement). Sum those deltas and ADD them to the existing
-- leave_credits.total_credits rather than replacing it.
--
-- One-time repair: recompute all 2026 leave_credits.total_credits rows to
-- match SUM(leave_credit_accruals.amount) for that employee/type/year. This
-- corrects the May 2026 accrual rows that were inserted but never reflected
-- in the balance.

SET search_path TO hris, public, auth, extensions;

-- ── 1. Fixed accrual function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hris.accrue_monthly_leave_credits(
  p_year  INT,
  p_month INT
)
RETURNS TABLE (
  year_v          INT,
  month_v         INT,
  employees_count INT,
  rows_inserted   INT,
  rows_skipped    INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_employees INT;
  v_inserted  INT;
  v_attempted INT;
BEGIN
  IF p_year IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'year and month are required';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month must be between 1 and 12';
  END IF;

  SELECT count(*) INTO v_attempted
  FROM hris.employees e
  CROSS JOIN hris.leave_types lt
  WHERE e.status = 'active'
    AND lt.annual_credits IS NOT NULL
    AND lt.annual_credits > 0;

  -- Insert ledger rows; skip already-accrued cells (idempotent).
  -- RETURNING includes `amount` so the next CTE can sum deltas without
  -- re-querying the table (which would not see the just-inserted rows due
  -- to CTE snapshot isolation).
  WITH inserted AS (
    INSERT INTO hris.leave_credit_accruals
      (employee_id, leave_type_id, year, month, amount, source, notes)
    SELECT
      e.id,
      lt.id,
      p_year,
      p_month,
      ROUND(lt.annual_credits / 12.0, 4),
      'monthly_accrual',
      lt.code || ' accrual ' || p_year || '-' || lpad(p_month::text, 2, '0')
    FROM hris.employees e
    CROSS JOIN hris.leave_types lt
    WHERE e.status = 'active'
      AND lt.annual_credits IS NOT NULL
      AND lt.annual_credits > 0
    ON CONFLICT DO NOTHING
    RETURNING employee_id, leave_type_id, amount
  ),
  delta AS (
    -- Sum per (employee, leave_type) from RETURNING data — visible here,
    -- unlike a fresh SELECT on the table which shares the pre-insert snapshot.
    SELECT employee_id, leave_type_id, SUM(amount) AS delta_amount
    FROM inserted
    GROUP BY employee_id, leave_type_id
  ),
  upserted AS (
    INSERT INTO hris.leave_credits (employee_id, leave_type_id, year, total_credits)
    SELECT employee_id, leave_type_id, p_year, delta_amount FROM delta
    ON CONFLICT (employee_id, leave_type_id, year)
    -- ADD the delta to the existing total instead of replacing it.
    DO UPDATE SET total_credits = hris.leave_credits.total_credits + EXCLUDED.total_credits
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM upserted;

  SELECT count(*) INTO v_employees FROM hris.employees WHERE status = 'active';

  RETURN QUERY SELECT
    p_year                    AS year_v,
    p_month                   AS month_v,
    v_employees               AS employees_count,
    COALESCE(v_inserted, 0)   AS rows_inserted,
    GREATEST(v_attempted - COALESCE(v_inserted, 0), 0) AS rows_skipped;
END
$$;

COMMENT ON FUNCTION hris.accrue_monthly_leave_credits(INT, INT) IS
  'Accrue VL/SL (and any leave_types.annual_credits>0) for one month. Idempotent. Uses delta-based UPDATE so CTE snapshot isolation does not suppress the balance change.';

-- ── 2. One-time repair: recompute all 2026 leave_credits totals ──────────
--
-- The May 2026 pg_cron run inserted accrual rows correctly but left
-- leave_credits.total_credits at the old baseline. Fix by setting each row
-- to SUM(leave_credit_accruals.amount) for that (employee, leave_type, year).

UPDATE hris.leave_credits lc
SET total_credits = sub.correct_total
FROM (
  SELECT employee_id, leave_type_id, year, SUM(amount) AS correct_total
  FROM hris.leave_credit_accruals
  WHERE year = 2026
  GROUP BY employee_id, leave_type_id, year
) sub
WHERE lc.employee_id   = sub.employee_id
  AND lc.leave_type_id = sub.leave_type_id
  AND lc.year          = sub.year
  AND lc.total_credits <> sub.correct_total;
