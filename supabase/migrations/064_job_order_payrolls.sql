-- Migration 064: Job Order payroll, rebuilt on hris.job_order_employees.
--
-- Migration 023 created hris.jo_payroll / jo_payroll_members against
-- hris.employees filtered to employment_type = 'jo'. Spec 1 moved Job Order
-- personnel into hris.job_order_employees and left that population dormant, so
-- the old tables point at people the roster no longer manages. They were never
-- used in production (confirmed with the developer), so they are dropped and
-- rebuilt rather than migrated.
--
-- Each member row carries a FROZEN SNAPSHOT of everything the printables need.
-- A payroll is a record of what was paid; editing or deleting a JO afterwards
-- must not alter a document that was already issued. The roster is joined only
-- when a member is added or explicitly refreshed.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema. That is exactly why RLS below is mandatory.

SET search_path TO hris, public, auth, extensions;

DROP TABLE IF EXISTS hris.jo_payroll_members;
DROP TABLE IF EXISTS hris.jo_payroll;

-- ── Payrolls ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_payrolls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  -- Default working days for the period. Members may each override it.
  days             NUMERIC(5,2),
  description      TEXT,
  particulars      TEXT,
  -- Denormalized display/print label, recomputed from the members'
  -- area_name whenever membership changes. Members are the source of truth.
  areas            TEXT,
  payroll_date     DATE,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'finalized')),
  finalized_at     TIMESTAMPTZ,
  finalized_by     UUID,
  -- True for payrolls imported from the legacy system. Legacy
  -- jopayroll_members had no rate column — it joined live to jos.rate — so
  -- migrated amounts are priced at the JO's CURRENT rate and are
  -- reconstructions, not records. The UI badges them.
  is_reconstructed BOOLEAN NOT NULL DEFAULT false,
  legacy_id        BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_by       UUID,
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT chk_job_order_payroll_period CHECK (period_end >= period_start)
);

-- NON-PARTIAL on purpose. A `WHERE legacy_id IS NOT NULL` predicate cannot be
-- inferred by PostgREST's .upsert({onConflict}) and fails with 42P10 — the
-- defect migration 059 had to fix for job_order_employees. Postgres already
-- treats NULLs as distinct, so hand-created payrolls are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_payrolls_legacy_id
  ON hris.job_order_payrolls(legacy_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_period
  ON hris.job_order_payrolls(period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_status
  ON hris.job_order_payrolls(status);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_deleted_at
  ON hris.job_order_payrolls(deleted_at);

CREATE TRIGGER trg_job_order_payrolls_updated_at
  BEFORE UPDATE ON hris.job_order_payrolls
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Payroll members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_payroll_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id            UUID NOT NULL
                          REFERENCES hris.job_order_payrolls(id) ON DELETE CASCADE,
  -- Nullable with ON DELETE SET NULL: deleting a JO must never destroy
  -- payroll history. The snapshot below carries the printout on its own.
  job_order_employee_id UUID
                          REFERENCES hris.job_order_employees(id) ON DELETE SET NULL,

  -- Editable inputs.
  days                  NUMERIC(5,2),
  -- OVERTIME hours. NOT job_order_employees.working_hours, which migration 061
  -- retyped to TEXT because it holds shift descriptors ("7:00 PM - 7:00 AM").
  hours                 NUMERIC(5,2),

  -- Frozen snapshot: every field the ten printables read.
  full_name                  TEXT NOT NULL,
  area_name                  TEXT,
  sub_area                   TEXT,
  daily_rate                 NUMERIC(10,2),
  sss_no                     TEXT,
  sss_ss                     NUMERIC(10,2),
  sss_ec                     NUMERIC(10,2),
  has_atm                    BOOLEAN NOT NULL DEFAULT false,
  landbank_account_number    TEXT,
  community_tax_number       TEXT,
  community_tax_date         DATE,
  community_tax_place_issued TEXT,

  legacy_id             BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Plain, not partial: NULLs compare as distinct, so this blocks adding the
  -- same JO twice while still allowing any number of unlinked manual rows.
  CONSTRAINT uq_job_order_payroll_members UNIQUE (payroll_id, job_order_employee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_payroll_members_legacy_id
  ON hris.job_order_payroll_members(legacy_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payroll_members_payroll
  ON hris.job_order_payroll_members(payroll_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payroll_members_employee
  ON hris.job_order_payroll_members(job_order_employee_id);

CREATE TRIGGER trg_job_order_payroll_members_updated_at
  BEFORE UPDATE ON hris.job_order_payroll_members
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mandatory. Migration 020 grants SELECT on new hris tables to `anon` and ALL
-- to `authenticated`; the anon key ships in the browser bundle. These rows
-- carry LandBank account numbers and SSS numbers. Spec 1's identical omission
-- (migrations 055/056) left Job Order PII world-readable until migration 060.
ALTER TABLE hris.job_order_payrolls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_payroll_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_payrolls" ON hris.job_order_payrolls
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

CREATE POLICY "admin_all_job_order_payroll_members" ON hris.job_order_payroll_members
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));
