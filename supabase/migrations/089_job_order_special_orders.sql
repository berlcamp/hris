-- Migration 089: Job Order SPECIAL ORDERS.
--
-- Sibling of migration 078 (job order memoranda) and shaped the same way, for
-- the same reasons. A Special Order is one printed Office of the City Mayor
-- document covering MANY Job Order personnel:
--
--   "SPECIAL ORDER NO. 2025-AHFO-SO-052", addressed to the City Administrator,
--   "the ensuing named personnel are directed to render additional time
--    services during Saturdays and Holidays only effective <period>; thus:"
--
-- followed by a No. / NAMES / AREA ASSIGNED table and "For strict compliance."
--
-- Not folded into job_order_memos as a third `memo_type`: a Special Order is a
-- different document series with its own numbering, a different printed table
-- (no RATE column) and a different copies-furnished list. Sharing one table
-- would mean every memo query had to remember to exclude SOs, and the SO
-- number series would interleave with the memo one in the list.
--
-- Members carry a FROZEN SNAPSHOT of name and area assignment, exactly as
-- job_order_memo_members does: an SO is an issued document, so editing or
-- deleting a JO afterwards must not rewrite a paper that already left the
-- office. There is no rate snapshot because the SO does not print one.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema. That is exactly why RLS below is mandatory.

SET search_path TO hris, public, auth, extensions;

-- ── Special Orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_special_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The "SO No." the office types, printed verbatim as the document heading:
  -- "SPECIAL ORDER NO. 2025-AHFO-SO-052". Free text, not generated — the
  -- series is assigned outside this system and back-dated entries have to be
  -- able to reuse whatever number the paper carries.
  so_no          TEXT,
  subject        TEXT NOT NULL,
  so_date        DATE NOT NULL,
  -- The effectivity phrase interpolated into the body sentence, verbatim:
  -- "JUNE 2025". Text rather than a date range because the office words it as
  -- a month, a month span or a day span depending on the order.
  period_covered TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID,
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_order_special_orders_date
  ON hris.job_order_special_orders(so_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_order_special_orders_deleted_at
  ON hris.job_order_special_orders(deleted_at);

CREATE TRIGGER trg_job_order_special_orders_updated_at
  BEFORE UPDATE ON hris.job_order_special_orders
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Special Order members ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_special_order_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  special_order_id      UUID NOT NULL
                          REFERENCES hris.job_order_special_orders(id)
                          ON DELETE CASCADE,
  -- Nullable with ON DELETE SET NULL: deleting a JO must never destroy an
  -- issued order. The snapshot below carries the printout on its own.
  job_order_employee_id UUID
                          REFERENCES hris.job_order_employees(id)
                          ON DELETE SET NULL,

  -- Frozen snapshot: the two printed columns.
  full_name             TEXT NOT NULL,
  -- The area name at snapshot time — printed as AREA ASSIGNED.
  area_assigned         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Plain, not partial: NULLs compare as distinct, so this blocks listing the
  -- same JO twice on one order while still allowing unlinked manual rows.
  CONSTRAINT uq_job_order_special_order_members
    UNIQUE (special_order_id, job_order_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_job_order_so_members_order
  ON hris.job_order_special_order_members(special_order_id);
CREATE INDEX IF NOT EXISTS idx_job_order_so_members_employee
  ON hris.job_order_special_order_members(job_order_employee_id);

CREATE TRIGGER trg_job_order_special_order_members_updated_at
  BEFORE UPDATE ON hris.job_order_special_order_members
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mandatory. Migration 020 grants SELECT on new hris tables to `anon` and ALL
-- to `authenticated`; the anon key ships in the browser bundle. These rows
-- name Job Order personnel and where they are assigned.
ALTER TABLE hris.job_order_special_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_special_order_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_special_orders"
  ON hris.job_order_special_orders
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

CREATE POLICY "admin_all_job_order_special_order_members"
  ON hris.job_order_special_order_members
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));
