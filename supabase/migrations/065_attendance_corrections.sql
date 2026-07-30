-- Migration 065: Attendance corrections
--
-- A Department Admin can file a proof-backed request to correct an employee's
-- attendance over a date range; nothing reaches hris.attendance_logs until an
-- HR admin / DTR Manager approves it.
--
-- Three parts:
--   1. employees.attendance_correction_eligible — HR flags who is correctable.
--   2. The 'no_break' reason code, for a day worked straight through lunch.
--      Without it the DTR's two middle cells print blank and read as missed
--      punches. The late/undertime math for such a day is already correct.
--   3. attendance_logs.correction_locked — an applied correction must survive a
--      later biometric import, including one run with "overwrite existing" ON.

SET search_path TO hris, public, auth, extensions;

-- daterange overlap exclusion below needs GiST over a scalar (employee_id).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Eligibility -------------------------------------------------------------

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS attendance_correction_eligible BOOLEAN NOT NULL
    DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_correction_eligible
  ON hris.employees(attendance_correction_eligible)
  WHERE attendance_correction_eligible;

-- 2. The 'no_break' reason code ----------------------------------------------
-- Widens the CHECK on all five reason columns. Same re-runnable DO-block
-- pattern as migrations 053 and 054: drop both the auto-named inline CHECK and
-- the previous named one, then re-add with the widened list.

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off'', ''no_break''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'no_time_reason',
    'time_in_am_reason',
    'time_out_am_reason',
    'time_in_pm_reason',
    'time_out_pm_reason'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_check'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_allowed'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs ADD CONSTRAINT %I CHECK (%I IN (%s))',
      'attendance_logs_' || col || '_allowed', col, allowed
    );
  END LOOP;
END $$;

-- 3. Import protection --------------------------------------------------------
-- runImportReplay already skips days whose source is no longer 'biometric', but
-- importDahuaAttendance with overwrite ON upserts unconditionally. An explicit
-- flag is used rather than relying on `source`, which other flows may reset.

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS correction_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_correction_locked
  ON hris.attendance_logs(correction_locked)
  WHERE correction_locked;

-- 4. Requests -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hris.attendance_correction_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES hris.employees(id),
  -- Effective department (detailed_department_id ?? department_id), snapshot at
  -- submit time so a later re-detail does not orphan a pending request.
  department_id      UUID REFERENCES hris.departments(id),
  date_from          DATE NOT NULL,
  date_to            DATE NOT NULL,
  reason             TEXT NOT NULL,
  proof_path         TEXT NOT NULL,
  proof_filename     TEXT NOT NULL,
  proof_mime         TEXT,
  proof_size         INT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','needs_rebase','approved','rejected','cancelled')),
  requested_by       UUID,
  requested_by_email TEXT,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by        UUID,
  reviewed_by_email  TEXT,
  reviewed_at        TIMESTAMPTZ,
  review_notes       TEXT,
  applied_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT acr_range_chk CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_acr_status ON hris.attendance_correction_requests(status);
CREATE INDEX IF NOT EXISTS idx_acr_department ON hris.attendance_correction_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_acr_employee ON hris.attendance_correction_requests(employee_id);

-- At most one LIVE request per employee per overlapping date range.
-- 'needs_rebase' counts as live: the requester is expected to re-base it, so it
-- keeps its claim on those dates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acr_no_overlapping_pending'
  ) THEN
    ALTER TABLE hris.attendance_correction_requests
      ADD CONSTRAINT acr_no_overlapping_pending
      EXCLUDE USING gist (
        employee_id WITH =,
        daterange(date_from, date_to, '[]') WITH &&
      ) WHERE (status IN ('pending','needs_rebase'));
  END IF;
END $$;

-- 5. Items ---------------------------------------------------------------------
-- attendance_log_id is NOT NULL on purpose: an item can only exist for a date
-- that ALREADY has an attendance row. This enforces in the schema that this
-- workflow corrects misread and incomplete days, and never invents a day that
-- was never recorded.

CREATE TABLE IF NOT EXISTS hris.attendance_correction_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID NOT NULL
                           REFERENCES hris.attendance_correction_requests(id) ON DELETE CASCADE,
  duty_date              DATE NOT NULL,
  attendance_log_id      UUID NOT NULL REFERENCES hris.attendance_logs(id),
  disposition            TEXT NOT NULL DEFAULT 'update'
                           CHECK (disposition IN ('update','clear_as_off')),
  proposed_schedule_id   UUID REFERENCES hris.schedules(id),
  proposed_time_in_am    TIMESTAMPTZ,
  proposed_time_out_am   TIMESTAMPTZ,
  proposed_time_in_pm    TIMESTAMPTZ,
  proposed_time_out_pm   TIMESTAMPTZ,
  -- Narrower than the column these feed: attendance_logs accepts 'holiday',
  -- correction items do not.
  proposed_in_am_reason  TEXT CHECK (proposed_in_am_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_am_reason TEXT CHECK (proposed_out_am_reason IN ('travel','field_work','official_business','off','no_break')),
  proposed_in_pm_reason  TEXT CHECK (proposed_in_pm_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_pm_reason TEXT CHECK (proposed_out_pm_reason IN ('travel','field_work','official_business','off','no_break')),
  -- Snapshot of the attendance row at request time: drives the reviewer's
  -- before/after diff and the drift check at apply time.
  before                 JSONB NOT NULL,
  UNIQUE (request_id, duty_date)
);

CREATE INDEX IF NOT EXISTS idx_aci_request ON hris.attendance_correction_items(request_id);
CREATE INDEX IF NOT EXISTS idx_aci_log ON hris.attendance_correction_items(attendance_log_id);

-- 6. Proof storage bucket -------------------------------------------------------
-- Private, unlike the public `201-files` bucket: a document naming an employee
-- and their hours should not sit behind a guessable URL. Served via signed URL.
-- Guarded because Storage is disabled in the local config.toml (see CLAUDE.md),
-- so storage.buckets does not exist on a local stack.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('attendance-proofs', 'attendance-proofs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
