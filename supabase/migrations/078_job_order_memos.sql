-- Migration 078: Job Order memoranda.
--
-- A memo is one printed Office of the City Mayor document covering MANY Job
-- Order personnel. Two templates, chosen by `memo_type`:
--
--   'new'    -> addressed to the City Administrator, "you are hereby assigned
--               to process the job order contract for the period of <period>"
--   'retain' -> addressed to ALL PERSONS CONCERNED, "engagements ... hereby
--               extended until <period>", plus the three closing paragraphs
--
-- Both print the same No. / NAMES / OFFICE ASSIGNMENT / RATE table, which is
-- what job_order_memo_members holds.
--
-- Members carry a FROZEN SNAPSHOT of name, office assignment and rate, exactly
-- as job_order_payroll_members does (migration 064) and for the same reason: a
-- memo is an issued document, so editing or deleting a JO afterwards must not
-- rewrite a paper that already left the office. The roster is joined only when
-- a member is added.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema. That is exactly why RLS below is mandatory.

SET search_path TO hris, public, auth, extensions;

-- ── Memos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_memos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The "SO No." the office types, printed verbatim as the document heading:
  -- "MEMORANDUM NO. 2026-SNGF-JO-019". Free text, not generated — the series
  -- is assigned outside this system and back-dated entries have to be able to
  -- reuse whatever number the paper carries.
  memo_no        TEXT,
  memo_type      TEXT NOT NULL DEFAULT 'new'
                   CHECK (memo_type IN ('new', 'retain')),
  subject        TEXT NOT NULL,
  memo_date      DATE NOT NULL,
  -- The period phrase interpolated into the body sentence, verbatim:
  -- "July 24-31, 2026" (new) or "AUGUST 2026 - SEPTEMBER 2026" (retain). Text
  -- rather than a date range because the two templates word it differently and
  -- the retain memo's phrase is a month span, not a day span.
  period_covered TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID,
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_order_memos_date
  ON hris.job_order_memos(memo_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_order_memos_type
  ON hris.job_order_memos(memo_type);
CREATE INDEX IF NOT EXISTS idx_job_order_memos_deleted_at
  ON hris.job_order_memos(deleted_at);

CREATE TRIGGER trg_job_order_memos_updated_at
  BEFORE UPDATE ON hris.job_order_memos
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Memo members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_memo_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id               UUID NOT NULL
                          REFERENCES hris.job_order_memos(id) ON DELETE CASCADE,
  -- Nullable with ON DELETE SET NULL: deleting a JO must never destroy an
  -- issued memo. The snapshot below carries the printout on its own.
  job_order_employee_id UUID
                          REFERENCES hris.job_order_employees(id) ON DELETE SET NULL,

  -- Frozen snapshot: the three printed columns.
  full_name             TEXT NOT NULL,
  -- The area name at snapshot time — printed as OFFICE ASSIGNMENT.
  office_assignment     TEXT,
  daily_rate            NUMERIC(10,2),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Plain, not partial: NULLs compare as distinct, so this blocks listing the
  -- same JO twice on one memo while still allowing unlinked manual rows.
  CONSTRAINT uq_job_order_memo_members UNIQUE (memo_id, job_order_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_job_order_memo_members_memo
  ON hris.job_order_memo_members(memo_id);
CREATE INDEX IF NOT EXISTS idx_job_order_memo_members_employee
  ON hris.job_order_memo_members(job_order_employee_id);

CREATE TRIGGER trg_job_order_memo_members_updated_at
  BEFORE UPDATE ON hris.job_order_memo_members
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mandatory. Migration 020 grants SELECT on new hris tables to `anon` and ALL
-- to `authenticated`; the anon key ships in the browser bundle. These rows
-- name Job Order personnel and their daily rates.
ALTER TABLE hris.job_order_memos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_memo_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_memos" ON hris.job_order_memos
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

CREATE POLICY "admin_all_job_order_memo_members" ON hris.job_order_memo_members
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));
