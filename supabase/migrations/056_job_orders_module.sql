-- Migration 056: Job Orders module — Area Assignments and JO employees.
--
-- Job Order personnel are deliberately NOT stored in hris.employees. They are a
-- separate population with their own fields (daily rate, community tax
-- certificate, LandBank ATM, area assignment) and none of the plantilla
-- machinery (salary grade, step increment, leave credits, DTR).
--
-- The legacy Laravel/MySQL `jos` table is the source of truth for the initial
-- load. legacy_id holds jos.id so the CSV import is idempotent: re-running it
-- updates in place instead of duplicating the roster.
--
-- Legacy stores dates and numbers as char/varchar columns, so the importer
-- parses tolerantly and writes NULL on failure rather than rejecting a person.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema.

SET search_path TO hris, public, auth, extensions;

-- ── Area Assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_areas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- Generated so it can never drift from name, whichever code path writes it.
  normalized_name TEXT GENERATED ALWAYS AS
                    (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) STORED,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ
);

-- Partial: soft-deleting an area frees its name for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_areas_normalized_name
  ON hris.job_order_areas(normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_order_areas_is_active
  ON hris.job_order_areas(is_active);

CREATE TRIGGER trg_job_order_areas_updated_at
  BEFORE UPDATE ON hris.job_order_areas
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Job Order employees ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_employees (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Authoritative name. Fed verbatim to the payroll printables; never rewritten.
  full_name                  TEXT NOT NULL,
  -- Derived surname-first ordering key. A wrong guess misorders a list row but
  -- can never corrupt a printed name.
  sort_name                  TEXT,
  sex                        TEXT CHECK (sex IN ('male', 'female')),
  purok                      TEXT,
  barangay                   TEXT,
  area_id                    UUID NOT NULL
                               REFERENCES hris.job_order_areas(id) ON DELETE RESTRICT,
  sub_area                   TEXT,
  daily_rate                 NUMERIC(10,2),
  previous_daily_rate        NUMERIC(10,2),
  working_hours              NUMERIC(4,2),
  date_started               DATE,
  eligibility                TEXT,
  recommended_by             TEXT,
  remarks                    TEXT,
  remarks_2                  TEXT,
  has_atm                    BOOLEAN NOT NULL DEFAULT false,
  landbank_account_number    TEXT,
  sss_no                     TEXT,
  sss_ss                     NUMERIC(10,2),
  sss_ec                     NUMERIC(10,2),
  community_tax_number       TEXT,
  community_tax_date         DATE,
  community_tax_place_issued TEXT,
  status                     TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  legacy_id                  BIGINT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                 UUID,
  updated_by                 UUID,
  deleted_at                 TIMESTAMPTZ,
  -- Mirrors the zod refinement: no account number without an ATM.
  CONSTRAINT chk_job_order_atm_account CHECK (
    has_atm = true OR landbank_account_number IS NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_employees_legacy_id
  ON hris.job_order_employees(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_order_employees_area
  ON hris.job_order_employees(area_id);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_status
  ON hris.job_order_employees(status);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_sort_name
  ON hris.job_order_employees(sort_name);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_deleted_at
  ON hris.job_order_employees(deleted_at);

CREATE TRIGGER trg_job_order_employees_updated_at
  BEFORE UPDATE ON hris.job_order_employees
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Seed ─────────────────────────────────────────────────────────────────
-- area_id is NOT NULL because every JO belongs to exactly one area, but legacy
-- rows may have a blank area_assigned. The importer routes those here. This is
-- for migrated data only — the employee form requires an explicit area.
INSERT INTO hris.job_order_areas (name, description)
SELECT 'Unassigned', 'Placeholder for migrated records with no area in the legacy system.'
WHERE NOT EXISTS (
  SELECT 1 FROM hris.job_order_areas WHERE normalized_name = 'unassigned'
);
