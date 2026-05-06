-- Migration 017: SQL-level monthly accrual function.
--
-- Adds `hris.accrue_monthly_leave_credits(year, month)`:
--   * For every active employee, for every leave_type with annual_credits > 0,
--     inserts a `monthly_accrual` ledger row with amount = annual_credits / 12.
--   * Idempotent: the unique partial index on
--     (employee_id, leave_type_id, year, month) WHERE source='monthly_accrual'
--     causes ON CONFLICT DO NOTHING to silently skip already-accrued cells.
--   * After insert, upserts `leave_credits.total_credits` = SUM(ledger.amount)
--     for affected (employee, leave_type, year) rows.
--
-- Returns one row with summary counters so the caller (UI button or pg_cron
-- log) can confirm what happened.

SET search_path TO hris, public, auth, extensions;

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

  -- Snapshot of how many cells we *would* try to insert (before idempotency).
  SELECT count(*) INTO v_attempted
  FROM hris.employees e
  CROSS JOIN hris.leave_types lt
  WHERE e.status = 'active'
    AND lt.annual_credits IS NOT NULL
    AND lt.annual_credits > 0;

  -- Insert ledger rows; skip already-accrued cells.
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
    RETURNING employee_id, leave_type_id
  ),
  recomputed AS (
    -- For each (employee, leave_type) we touched, recompute the year total.
    SELECT
      i.employee_id,
      i.leave_type_id,
      (SELECT COALESCE(SUM(amount), 0)
         FROM hris.leave_credit_accruals
        WHERE employee_id   = i.employee_id
          AND leave_type_id = i.leave_type_id
          AND year          = p_year) AS total
    FROM (SELECT DISTINCT employee_id, leave_type_id FROM inserted) i
  ),
  upserted AS (
    INSERT INTO hris.leave_credits (employee_id, leave_type_id, year, total_credits)
    SELECT employee_id, leave_type_id, p_year, total FROM recomputed
    ON CONFLICT (employee_id, leave_type_id, year)
    DO UPDATE SET total_credits = EXCLUDED.total_credits
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
  'Accrue VL/SL (and any leave_types.annual_credits>0) for one month. Idempotent. Used by pg_cron and the HR "Run Monthly Accrual" button.';
