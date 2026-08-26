-- Migration 080: Add "event_attendance_officer" role.
--
-- The Event Attendance Officer works the door at an event and does one thing:
-- scans employee QR cards to record presence. It carries NO other access — no
-- employees, attendance/DTR, leave, CTO/COC, RSP, payroll, Job Orders, COS,
-- reports or administration tools, and it cannot create, edit or close an
-- event, nor read the resulting attendance report. App-side authorization
-- treats it via canScanEvents() (src/lib/auth-helpers.ts).
--
-- Deliberately a standing role rather than a per-event assignment table: the
-- office wants to appoint an officer once and have them able to scan anyone at
-- any open event, including personnel from departments they have no other
-- relationship with. That is the whole point of the role — it is scan-only, so
-- the breadth costs nothing beyond the scan log itself, which records
-- scanned_by on every row.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added. That is why the Events tables live in migration 081.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'event_attendance_officer';
