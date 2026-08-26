-- Migration 081: Events module — events, snapshotted rosters, per-day
-- attendance, and the QR credential every employee's printed card carries.
--
-- ── Why a separate credential table ──────────────────────────────────────
-- hris.employees already has a QR (src/lib/employee-qr.ts), but it encodes a
-- PUBLIC url — http://aoadmin.sortbrite.com/employee/<id_number> — keyed on
-- id_number, a legacy import field that only hris.employees rows carry. It is
-- guessable, forgeable with any QR generator, and does not exist for Job Order
-- or COS personnel at all. Attendance cards need the opposite properties, so
-- they get their own opaque token. The public-profile QR is left exactly as it
-- is; the two codes mean different things and must not be conflated.
--
-- ── Why the attendee key is polymorphic ──────────────────────────────────
-- There is no single person registry in this database. Plantilla staff live in
-- hris.employees (employment_type = 'plantilla'), Job Order personnel in
-- hris.job_order_employees, COS hires in hris.cos_employees. The three tables
-- share no key and no FK. Every attendee reference here is therefore
-- (subject_kind, subject_id) with no foreign key — a FK cannot span three
-- tables. Referential integrity is enforced in the server actions, which
-- resolve the subject before writing.
--
-- Rows still sitting in hris.employees with employment_type in ('jo','cos') are
-- legacy orphans: they are NOT reachable from this module. The roster builder
-- surfaces their count so the gap stays visible rather than silent.
--
-- ── Why event attendance never touches hris.attendance_logs ──────────────
-- attendance_logs is UNIQUE(employee_id, date), feeds the payroll deduction
-- engine, and its employee_id references hris.employees only. Writing event
-- presence into it would collide with the day's real DTR row, alter money, and
-- could not represent a Job Order or COS attendee in the first place. Event
-- attendance is a standalone record.

SET search_path TO hris, public, auth, extensions;

-- ── QR credentials ───────────────────────────────────────────────────────
-- One live token per person, permanent, reused for every event — printing a
-- card is a one-time act, not a per-event one. Reissue ROTATES: the old row is
-- stamped revoked_at and a new row is minted, so a lost card stops working.
-- An additive model would leave every lost card valid forever.
CREATE TABLE IF NOT EXISTS hris.qr_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque. 'H' + 20 uppercase hex (80 bits). The prefix lets the scanner
  -- reject a foreign QR — including the public-profile URL above — before it
  -- ever reaches the network.
  token          TEXT NOT NULL UNIQUE,
  subject_kind   TEXT NOT NULL
                   CHECK (subject_kind IN ('employee', 'job_order', 'cos')),
  subject_id     UUID NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT,
  -- Issuance tracking. "Was Juan ever given a card?" is asked constantly once
  -- a print run goes out, and nothing else in the system can answer it.
  printed_at     TIMESTAMPTZ,
  print_count    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID
);

-- At most one LIVE credential per person; revoked rows accumulate as history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_credentials_live
  ON hris.qr_credentials (subject_kind, subject_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qr_credentials_subject
  ON hris.qr_credentials (subject_kind, subject_id);

-- ── Events ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  venue         TEXT,
  -- A date RANGE, not a single date. A three-day training records attendance
  -- per day (see uq_event_attendance_day); a one-day event simply has
  -- start_date = end_date and behaves as a single scan per person.
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  -- draft  → roster being built, not scannable
  -- open   → scannable
  -- closed → report final; late offline scans still land, flagged synced_late
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'closed')),
  closed_at     TIMESTAMPTZ,
  closed_by     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT chk_events_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_events_status_dates
  ON hris.events (status, start_date DESC)
  WHERE deleted_at IS NULL;

-- ── Roster ───────────────────────────────────────────────────────────────
-- Snapshotted at build time. A hire, a transfer or a resignation after the
-- event must not retroactively rewrite who was expected to attend, and the
-- printed report has to keep matching the one filed last month.
--
-- The QR token is deliberately NOT snapshotted here: the scanner joins to the
-- live credential when it downloads the roster, so a card reissued the morning
-- of the event still works.
CREATE TABLE IF NOT EXISTS hris.event_roster (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES hris.events(id) ON DELETE CASCADE,
  subject_kind     TEXT NOT NULL
                     CHECK (subject_kind IN ('employee', 'job_order', 'cos')),
  subject_id       UUID NOT NULL,
  full_name        TEXT NOT NULL,
  -- employee_no / cos_no. Job Order personnel have no number of any kind in
  -- their registry, so this is NULL for them and the card falls back to the
  -- credential token's tail.
  id_number        TEXT,
  -- Department name for plantilla and COS; AREA name for Job Order, which has
  -- no department_id at all (job_order_employees.area_id → job_order_areas).
  group_name       TEXT,
  employment_label TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, subject_kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_event_roster_event
  ON hris.event_roster (event_id);

-- ── Attendance ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.event_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES hris.events(id) ON DELETE CASCADE,
  -- Derived from the DEVICE clock at scan time, not from the sync time: a scan
  -- taken at 23:58 and synced the next morning belongs to the day it happened.
  attendance_date DATE NOT NULL,
  subject_kind    TEXT NOT NULL
                    CHECK (subject_kind IN ('employee', 'job_order', 'cos')),
  subject_id      UUID NOT NULL,
  -- Resolved at record time, for the same reason the roster is snapshotted.
  full_name       TEXT NOT NULL,
  -- 'manual' is the officer marking someone present by name because the card
  -- was forgotten, lost or unreadable. Recorded rather than blocked — an
  -- officer who cannot record a real attendee will use paper — but flagged, so
  -- HR can tell a scan from an assertion.
  method          TEXT NOT NULL CHECK (method IN ('scan', 'manual')),
  -- Scanned but not on the snapshotted roster. Never rejected: the officer at
  -- the door cannot debug a roster.
  is_walk_in      BOOLEAN NOT NULL DEFAULT false,
  scanned_at      TIMESTAMPTZ NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Landed after the event was closed. The report shows these as amendments
  -- rather than silently changing a total somebody already printed.
  synced_late     BOOLEAN NOT NULL DEFAULT false,
  -- Idempotency key minted on the device. The offline queue may replay a batch
  -- after a dropped connection; this is what makes the replay harmless.
  client_scan_id  TEXT,
  -- The raw token as scanned, kept for the audit trail even after rotation.
  qr_token        TEXT,
  scanned_by      UUID NOT NULL REFERENCES hris.user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One presence record per person PER DAY. This is what makes a multi-day event
-- work: day 2's scan is a different row, not a rejected duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendance_day
  ON hris.event_attendance (event_id, attendance_date, subject_kind, subject_id);

-- Replay protection for the offline queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendance_client_scan
  ON hris.event_attendance (event_id, client_scan_id)
  WHERE client_scan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_attendance_event_date
  ON hris.event_attendance (event_id, attendance_date);

-- ── updated_at triggers ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_qr_credentials_updated_at ON hris.qr_credentials;
CREATE TRIGGER trg_qr_credentials_updated_at
  BEFORE UPDATE ON hris.qr_credentials
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON hris.events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON hris.events
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Backfill credentials for everyone currently active ───────────────────
-- Minting on first print instead would mean the very first print run has to
-- write to three registries mid-request; doing it once here keeps printing a
-- pure read. New hires get a credential from the server actions, which mint on
-- demand for any subject that has no live row.
--
-- Token shape: 'H' + 20 uppercase hex, taken from gen_random_uuid() so this
-- needs no pgcrypto. 80 bits of entropy; the UNIQUE constraint catches the
-- lottery-odds collision.
INSERT INTO hris.qr_credentials (token, subject_kind, subject_id)
SELECT
  'H' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  'employee',
  e.id
FROM hris.employees e
WHERE e.employment_type = 'plantilla'
  AND e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM hris.qr_credentials c
    WHERE c.subject_kind = 'employee' AND c.subject_id = e.id
      AND c.revoked_at IS NULL
  );

INSERT INTO hris.qr_credentials (token, subject_kind, subject_id)
SELECT
  'H' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  'job_order',
  j.id
FROM hris.job_order_employees j
WHERE j.status = 'active'
  AND j.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM hris.qr_credentials c
    WHERE c.subject_kind = 'job_order' AND c.subject_id = j.id
      AND c.revoked_at IS NULL
  );

INSERT INTO hris.qr_credentials (token, subject_kind, subject_id)
SELECT
  'H' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  'cos',
  c2.id
FROM hris.cos_employees c2
WHERE c2.status = 'active'
  AND c2.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM hris.qr_credentials c
    WHERE c.subject_kind = 'cos' AND c.subject_id = c2.id
      AND c.revoked_at IS NULL
  );

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mandatory. Migration 020 installed `ALTER DEFAULT PRIVILEGES IN SCHEMA hris
-- GRANT ALL ON TABLES TO authenticated`, which auto-grants ALL the instant
-- CREATE TABLE runs above — so the REVOKEs below are required, not decorative.
-- A bare GRANT SELECT would be additive on top of that pre-existing ALL.
ALTER TABLE hris.qr_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.event_roster     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.event_attendance ENABLE ROW LEVEL SECURITY;

-- qr_credentials holds BEARER tokens: anything that can read this table can
-- forge attendance for every employee in the LGU. `authenticated` therefore
-- gets no grant at all — not even SELECT. The Event Attendance Officer never
-- queries it directly either; the scanner receives only its own event's roster,
-- through a server action on the service-role admin client. Do NOT add an
-- authenticated grant here.
CREATE POLICY "admin_all_qr_credentials" ON hris.qr_credentials
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

REVOKE ALL ON hris.qr_credentials FROM authenticated;
GRANT ALL  ON hris.qr_credentials TO service_role;

-- Events, rosters and attendance name real personnel. Reporting is HR-only in
-- v1; every write goes through the server actions on the admin client, so
-- `authenticated` is held to SELECT and the policy narrows that to HR.
CREATE POLICY "admin_all_events" ON hris.events
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_event_roster" ON hris.event_roster
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "admin_all_event_attendance" ON hris.event_attendance
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

REVOKE ALL   ON hris.events           FROM authenticated;
REVOKE ALL   ON hris.event_roster     FROM authenticated;
REVOKE ALL   ON hris.event_attendance FROM authenticated;
GRANT SELECT ON hris.events           TO authenticated;
GRANT SELECT ON hris.event_roster     TO authenticated;
GRANT SELECT ON hris.event_attendance TO authenticated;
GRANT ALL    ON hris.events           TO service_role;
GRANT ALL    ON hris.event_roster     TO service_role;
GRANT ALL    ON hris.event_attendance TO service_role;

-- Reload PostgREST schema cache so the new tables and FKs are picked up
NOTIFY pgrst, 'reload schema';
