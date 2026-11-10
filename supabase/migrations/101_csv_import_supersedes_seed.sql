-- Migration 101: a CSV-imported leave total supersedes the annual seed.
--
-- Bug: the leave-credits CSV import treats each value as the year's TOTAL, but
-- it only replaced earlier csv_import rows. The automatic annual `seed` (3 days
-- of SPL, provisioned 2026-05-08) stayed, so the 2026-05-09 import was added on
-- top of it: SPL totals of 4-6 instead of the imported 1-3, and 3 instead of 0
-- where the CSV said 0. In production this is 39 (employee, SPL, 2026) keys;
-- HR had already offset 11 of them with manual adjustments.
--
-- Fix:
--   1. Zero every non-zero `seed` row that has a `csv_import` row for the same
--      (employee, leave_type, year) and no negative HR adjustment (28 keys in
--      production). Zeroed, not deleted: provision_year() re-seeds any key with
--      no seed row, which would double the credits again.
--   2. Recompute leave_credits.total_credits = SUM(ledger) for those keys
--      (leave_credit_balances reads total_credits, not the ledger).
--   3. provision_year() no longer seeds a key that already has a csv_import row,
--      so an import made before the year is provisioned is not doubled either.
--
-- The app-side half of the fix is replaceCsvImportLedger() in
-- src/lib/leave-credits-helpers.ts, which now zeroes the seed on every import.
-- Re-running this migration is a no-op.

SET search_path TO hris, public, auth, extensions;

-- ── 1 + 2. Data correction ───────────────────────────────────────────────
UPDATE hris.leave_credit_accruals s
   SET amount = 0,
       notes  = 'Annual seed superseded by CSV import'
 WHERE s.source = 'seed'
   AND s.amount <> 0
   AND EXISTS (
     SELECT 1 FROM hris.leave_credit_accruals c
      WHERE c.employee_id   = s.employee_id
        AND c.leave_type_id = s.leave_type_id
        AND c.year          = s.year
        AND c.source        = 'csv_import'
   )
   -- HR already corrected some keys by hand on 2026-05-12/13 with negative
   -- adjustments ("3 max SPL", "records as of 13 May 2026"). Zeroing their seed
   -- too would take the credits off twice, so any key with a negative
   -- adjustment is left as HR set it.
   AND NOT EXISTS (
     SELECT 1 FROM hris.leave_credit_accruals adj
      WHERE adj.employee_id   = s.employee_id
        AND adj.leave_type_id = s.leave_type_id
        AND adj.year          = s.year
        AND adj.source        = 'adjustment'
        AND adj.amount        < 0
   );

-- total_credits must equal SUM(ledger). Recomputing every key that has both a
-- seed and a csv_import row covers the rows just zeroed and changes nothing
-- for keys that were already correct.
UPDATE hris.leave_credits lc
   SET total_credits = (
         SELECT COALESCE(SUM(a.amount), 0)
           FROM hris.leave_credit_accruals a
          WHERE a.employee_id   = lc.employee_id
            AND a.leave_type_id = lc.leave_type_id
            AND a.year          = lc.year
       )
 WHERE EXISTS (
         SELECT 1 FROM hris.leave_credit_accruals c
          WHERE c.employee_id   = lc.employee_id
            AND c.leave_type_id = lc.leave_type_id
            AND c.year          = lc.year
            AND c.source        = 'csv_import'
       )
   AND EXISTS (
         SELECT 1 FROM hris.leave_credit_accruals s
          WHERE s.employee_id   = lc.employee_id
            AND s.leave_type_id = lc.leave_type_id
            AND s.year          = lc.year
            AND s.source        = 'seed'
       );

-- ── 3. provision_year(): don't seed over an imported total ───────────────
-- Identical to migration 018 except the seed step's NOT EXISTS also checks
-- for a csv_import row.
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
         AND a.source        IN ('seed', 'csv_import')
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
  'Provision a year for all active employees: carryover for cumulative accruing types, seed for non-accruing capped types (skipped where a CSV import already set the total). Idempotent. Used by pg_cron on Jan 1 and by the HR "Provision Credits" button.';
