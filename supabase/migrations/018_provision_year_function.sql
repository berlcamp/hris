-- Migration 018: SQL-level year provisioning function.
--
-- Adds `hris.provision_year(year)`:
--   * For every active employee, for every leave_type:
--     - If is_cumulative AND annual_credits IS NOT NULL (accruing types like
--       VL/SL): write a `carryover` ledger row equal to the prior year's
--       remaining balance from `leave_credit_balances`, IF there is no
--       `carryover` row already for that (employee, leave_type, year).
--     - Else if max_credits > 0 (non-accruing capped types like SPL/FL/ML/...):
--       write a `seed` ledger row equal to max_credits, IF there is no
--       `seed` row already for that (employee, leave_type, year).
--   * After writes, upserts `leave_credits.total_credits` = SUM(ledger.amount).
--
-- Idempotent: a uniqueness check per (employee, leave_type, year, source)
-- prevents duplicates on re-runs.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.provision_year(p_year INT)
RETURNS TABLE (
  carryover_rows INT,
  seed_rows      INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, auth, extensions
AS $$
DECLARE
  v_carry INT := 0;
  v_seed  INT := 0;
BEGIN
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'year is required';
  END IF;

  -- ── Carryover for accruing+cumulative types ─────────────────────────────
  WITH candidates AS (
    SELECT
      e.id              AS employee_id,
      lt.id             AS leave_type_id,
      COALESCE(prev.balance, 0) AS prev_balance
    FROM hris.employees e
    CROSS JOIN hris.leave_types lt
    LEFT JOIN hris.leave_credit_balances prev
      ON prev.employee_id   = e.id
     AND prev.leave_type_id = lt.id
     AND prev.year          = p_year - 1
    WHERE e.status = 'active'
      AND lt.is_cumulative = true
      AND lt.annual_credits IS NOT NULL
      AND lt.annual_credits > 0
  ),
  to_insert AS (
    SELECT c.* FROM candidates c
    WHERE c.prev_balance > 0
      AND NOT EXISTS (
        SELECT 1 FROM hris.leave_credit_accruals a
         WHERE a.employee_id   = c.employee_id
           AND a.leave_type_id = c.leave_type_id
           AND a.year          = p_year
           AND a.source        = 'carryover'
      )
  ),
  inserted AS (
    INSERT INTO hris.leave_credit_accruals
      (employee_id, leave_type_id, year, amount, source, notes)
    SELECT employee_id, leave_type_id, p_year, prev_balance,
           'carryover', 'Carried over from ' || (p_year - 1)
    FROM to_insert
    RETURNING employee_id, leave_type_id
  )
  SELECT count(*) INTO v_carry FROM inserted;

  -- ── Seed for non-accruing types with a fixed annual cap ─────────────────
  WITH candidates AS (
    SELECT
      e.id          AS employee_id,
      lt.id         AS leave_type_id,
      lt.max_credits AS amount
    FROM hris.employees e
    CROSS JOIN hris.leave_types lt
    WHERE e.status = 'active'
      AND (lt.annual_credits IS NULL OR lt.annual_credits = 0)
      AND lt.max_credits IS NOT NULL
      AND lt.max_credits > 0
  ),
  to_insert AS (
    SELECT c.* FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM hris.leave_credit_accruals a
       WHERE a.employee_id   = c.employee_id
         AND a.leave_type_id = c.leave_type_id
         AND a.year          = p_year
         AND a.source        = 'seed'
    )
  ),
  inserted AS (
    INSERT INTO hris.leave_credit_accruals
      (employee_id, leave_type_id, year, amount, source, notes)
    SELECT employee_id, leave_type_id, p_year, amount,
           'seed', 'Annual seed for ' || p_year
    FROM to_insert
    RETURNING employee_id, leave_type_id
  )
  SELECT count(*) INTO v_seed FROM inserted;

  -- ── Recompute leave_credits.total_credits for any (emp, type) we touched ─
  WITH touched AS (
    SELECT DISTINCT employee_id, leave_type_id
    FROM hris.leave_credit_accruals
    WHERE year = p_year
      AND source IN ('carryover', 'seed')
  ),
  totals AS (
    SELECT
      t.employee_id,
      t.leave_type_id,
      (SELECT COALESCE(SUM(amount), 0)
         FROM hris.leave_credit_accruals
        WHERE employee_id   = t.employee_id
          AND leave_type_id = t.leave_type_id
          AND year          = p_year) AS total
    FROM touched t
  )
  INSERT INTO hris.leave_credits (employee_id, leave_type_id, year, total_credits)
  SELECT employee_id, leave_type_id, p_year, total FROM totals
  ON CONFLICT (employee_id, leave_type_id, year)
  DO UPDATE SET total_credits = EXCLUDED.total_credits;

  RETURN QUERY SELECT v_carry, v_seed;
END
$$;

COMMENT ON FUNCTION hris.provision_year(INT) IS
  'Provision a year for all active employees: carryover for cumulative accruing types, seed for non-accruing capped types. Idempotent. Used by pg_cron on Jan 1 and by the HR "Provision Credits" button.';
