-- Migration 096: Job Order print signatories.
--
-- Every Job Order printable (Memorandum, Special Order, Daily Wages Payroll,
-- OBR, SSS Contribution List) used to hard-code the names and positions of the
-- people who sign it. A new administrator or a change of treasurer meant a code
-- change. This table holds them instead, edited from Job Orders → Signatories.
--
-- One row per signatory slot, keyed by a fixed text key the app knows about
-- (see JOB_ORDER_SIGNATORY_SLOTS in src/lib/job-order-signatories.ts). The app
-- falls back to its built-in defaults for any key with no row, so a missing row
-- never prints a blank signature line. The seed below is those same defaults,
-- i.e. exactly what the forms printed before this migration.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema. That is exactly why RLS below is mandatory.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.job_order_signatories (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  position    TEXT NOT NULL,
  -- Printed under the position only where the form has an office line (the
  -- Memorandum / Special Order addressee). NULL prints nothing.
  office      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

CREATE TRIGGER trg_job_order_signatories_updated_at
  BEFORE UPDATE ON hris.job_order_signatories
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

ALTER TABLE hris.job_order_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_signatories"
  ON hris.job_order_signatories
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

INSERT INTO hris.job_order_signatories (key, name, position, office) VALUES
  ('city_mayor',          'SAM NORMAN G. FUENTES',          'City Mayor',             NULL),
  ('city_administrator',  'MS. RUTHEZA GRACE A. OUANO',     'City Administrator',     'City Administrator''s Office'),
  ('payroll_accountant',  'EASY XAFLAVAIRE HOPE E. DIMAL',  'CITY ACCOUNTANT',        NULL),
  ('payroll_certifier',   'CAROLYN N. GO',                  'Executive Assistant IV', NULL),
  ('payroll_approver',    'RUTHEZA GRACE A. OUANO',         'City Admistrator',       NULL),
  ('payroll_treasurer',   'JULIE FE C. NAPIGKIT',           'City Treasurer',         NULL),
  ('obr_budget_officer',  'EVELYN T. OMILDA',               'Budget Officer',         NULL),
  ('sss_prepared_by',     'MARICELL P. SALVADOR',           'Day Care Worker I',      NULL),
  ('sss_noted_by',        'RUTHEZA GRACE A. OUANO',         'City Administrator',     NULL)
ON CONFLICT (key) DO NOTHING;
