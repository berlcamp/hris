-- Migration 020: Fix missing GRANTs on hris.leave_credit_accruals and
-- prevent the same class of bug for future tables.
--
-- Bug: leave_credit_accruals (added in 015) was created *after* the one-shot
-- `GRANT ALL ON ALL TABLES IN SCHEMA hris TO ...` in migration 007. That GRANT
-- only covers tables that exist at the moment it runs — new tables don't
-- inherit it. Result: any PostgREST / service_role write to
-- leave_credit_accruals (CSV import, Provision Credits button, Monthly
-- Accrual button, per-row adjustment dialog) failed with
-- "permission denied for table leave_credit_accruals".
--
-- (pg_cron accrual/provision jobs were unaffected: they run via
-- SECURITY DEFINER functions that bypass GRANT checks.)
--
-- Fix:
--   1) Re-run the schema-wide GRANTs to cover leave_credit_accruals (and any
--      other table that might have been added without explicit grants).
--   2) Set ALTER DEFAULT PRIVILEGES so any future table or sequence created
--      in the hris schema inherits the right privileges automatically.

SET search_path TO hris, public, auth, extensions;

-- ── 1. Re-apply schema-wide privileges (idempotent) ──────────────────────

GRANT ALL    ON ALL TABLES    IN SCHEMA hris TO authenticated;
GRANT SELECT ON ALL TABLES    IN SCHEMA hris TO anon;
GRANT ALL    ON ALL TABLES    IN SCHEMA hris TO service_role;

GRANT ALL    ON ALL SEQUENCES IN SCHEMA hris TO authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA hris TO anon;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA hris TO service_role;

-- ── 2. Future-proof: auto-grant on objects created from now on ───────────
-- ALTER DEFAULT PRIVILEGES applies to objects created by the role that
-- executes this statement. Supabase migrations run as `postgres`, and
-- future migrations will run as the same role, so this covers them.

ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA hris
  GRANT ALL ON SEQUENCES TO service_role;
