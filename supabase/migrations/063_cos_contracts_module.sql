-- Migration 063: Contract of Service — contracts and contract templates.
--
-- Fills the "Contract History" placeholder COS-1 left on the employee profile.
--
-- BODY STORAGE
-- ------------
-- `body` holds a Tiptap (ProseMirror) JSON document, not HTML. PDFs in this app
-- are produced client-side via pdf(<Doc/>).toBlob(), so an HTML body would put
-- an HTML parser on the print path and its unit tests would need a DOM that
-- `node --experimental-strip-types` does not provide. JSON is already a tree
-- over a known node vocabulary.
--
-- Creating a contract COPIES the chosen template's body. Editing a template
-- afterwards must never alter a contract already issued. The copy keeps its
-- {{merge_tokens}} UNRESOLVED; they resolve at print time against this row's
-- own columns, so an edited rate shows up on the next printout instead of
-- leaving stale text frozen in the body.
--
-- EXPIRY IS DERIVED, NEVER STORED
-- -------------------------------
-- A stored 'expired' status needs a cron to stay truthful and drifts the moment
-- that job fails. `period_end < today` is computed at read time. Only
-- 'terminated' -- an explicit human act with a date and a reason -- is stored.
SET search_path TO hris, public, auth, extensions;

-- btree_gist supplies the `uuid WITH =` operator class the exclusion
-- constraint below needs. gist alone cannot handle equality on uuid.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ── Templates ────────────────────────────────────────────────────────────
CREATE TABLE hris.cos_contract_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  -- Tiptap JSON. NOT NULL: an empty template stores the editor's empty
  -- document so the print path has one shape to handle, never two.
  body        JSONB NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES hris.user_profiles(id),
  updated_by  UUID REFERENCES hris.user_profiles(id),
  deleted_at  TIMESTAMPTZ
);

-- Partial, matching 058's uq_cos_employees_cos_no: soft-deleting a template
-- frees its name for reuse.
CREATE UNIQUE INDEX uq_cos_contract_templates_name
  ON hris.cos_contract_templates(lower(btrim(name))) WHERE deleted_at IS NULL;

CREATE INDEX idx_cos_contract_templates_active
  ON hris.cos_contract_templates(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_contract_templates_updated_at
  BEFORE UPDATE ON hris.cos_contract_templates
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Contracts ────────────────────────────────────────────────────────────
CREATE TABLE hris.cos_contracts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT, not CASCADE: contract history must outlive nothing. The app
  -- never hard-deletes an employee (deleteCosEmployee soft-deletes), so this
  -- is the backstop that makes that discipline safe.
  cos_employee_id    UUID NOT NULL
                       REFERENCES hris.cos_employees(id) ON DELETE RESTRICT,

  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,

  -- Copied onto the contract rather than read through to the employee: both
  -- legitimately differ between engagements, and a printed contract must not
  -- change when the registry is corrected later.
  monthly_rate       NUMERIC(12,2),
  position_title     TEXT,

  scope_of_work      TEXT,

  signatory_name     TEXT,
  signatory_position TEXT,
  witness_name       TEXT,
  witness_position   TEXT,

  body               JSONB NOT NULL,

  -- Provenance only. Never used to render: the body above is the snapshot.
  template_id        UUID REFERENCES hris.cos_contract_templates(id)
                       ON DELETE SET NULL,

  -- UNIQUE so a renewal chain cannot fork into two successors.
  renewed_from_id    UUID REFERENCES hris.cos_contracts(id) ON DELETE RESTRICT,

  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'terminated')),
  terminated_on      DATE,
  termination_reason TEXT,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  created_by         UUID REFERENCES hris.user_profiles(id),
  updated_by         UUID REFERENCES hris.user_profiles(id),
  deleted_at         TIMESTAMPTZ,

  CONSTRAINT cos_contracts_period_order
    CHECK (period_end >= period_start),

  -- Both directions: status and date move together or not at all.
  CONSTRAINT cos_contracts_termination_consistent
    CHECK ((status = 'terminated') = (terminated_on IS NOT NULL)),

  CONSTRAINT cos_contracts_terminated_within_period
    CHECK (
      terminated_on IS NULL
      OR (terminated_on >= period_start AND terminated_on <= period_end)
    ),

  CONSTRAINT uq_cos_contracts_renewed_from UNIQUE (renewed_from_id)
);

-- One employee cannot hold two contracts covering the same day.
--
-- COALESCE(terminated_on, period_end) is load-bearing: it releases the unused
-- tail of a terminated contract so a replacement can start the next day.
-- Without it, ending someone early would block re-engaging them for the rest
-- of the original period.
--
-- WHERE (deleted_at IS NULL) keeps soft-deleted rows from blocking reuse,
-- matching the partial unique indexes in 058.
ALTER TABLE hris.cos_contracts
  ADD CONSTRAINT cos_contracts_no_overlap
  EXCLUDE USING gist (
    cos_employee_id WITH =,
    daterange(period_start, COALESCE(terminated_on, period_end), '[]') WITH &&
  ) WHERE (deleted_at IS NULL);

CREATE INDEX idx_cos_contracts_employee
  ON hris.cos_contracts(cos_employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cos_contracts_period
  ON hris.cos_contracts(period_start, period_end) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_contracts_updated_at
  BEFORE UPDATE ON hris.cos_contracts
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ============================================================
-- RLS — same shape as 058, including the deliberate REVOKE.
--
-- Migration 020 installed ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
-- authenticated, which auto-grants ALL the instant CREATE TABLE runs above.
-- A bare GRANT SELECT would be additive on top of that and narrow nothing, so
-- the ALL grant must be revoked first. Restricting `authenticated` to SELECT
-- forces every write through the server actions, which hold the soft-delete
-- rule, the super_admin delete gate and logAudit. Do NOT "fix" this back to
-- GRANT ALL — it is deliberate.
-- ============================================================
ALTER TABLE hris.cos_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.cos_contracts          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cos_manager_all_cos_contract_templates"
  ON hris.cos_contract_templates
  FOR ALL USING (
    hris.get_user_role() IN ('super_admin', 'hr_admin', 'cos_manager')
  );

CREATE POLICY "cos_manager_all_cos_contracts" ON hris.cos_contracts
  FOR ALL USING (
    hris.get_user_role() IN ('super_admin', 'hr_admin', 'cos_manager')
  );

REVOKE ALL ON hris.cos_contract_templates FROM authenticated;
REVOKE ALL ON hris.cos_contracts          FROM authenticated;
GRANT SELECT ON hris.cos_contract_templates TO authenticated;
GRANT SELECT ON hris.cos_contracts          TO authenticated;
GRANT ALL    ON hris.cos_contract_templates TO service_role;
GRANT ALL    ON hris.cos_contracts          TO service_role;

NOTIFY pgrst, 'reload schema';
