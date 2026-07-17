-- Migration 051: Add "hr_record_manager" role.
--
-- HR Record Manager is a dedicated records role: it can create/edit employees
-- and manage their records, manage the plantilla, manage the salary grade
-- table, and work the NOSI module — the same reach hr_admin has for those
-- modules. It also views the employee QR code. It carries NO other access:
-- no attendance/DTR, leave, CTO/COC, RSP, payroll, reports, or any other
-- administration tool. App-side authorization treats hr_record_manager as an
-- HR records manager via canManageHrRecords() (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'hr_record_manager';
