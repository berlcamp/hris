-- Migration 039: Add "dtr_manager" role
--
-- DTR Manager is a dedicated attendance role: it can fully manage the
-- Attendance & DTR module (read all attendance, manual entry, biometric
-- imports, deletes, and DTR generation) exactly like super_admin / hr_admin,
-- but carries no other admin powers. App-side attendance authorization treats
-- dtr_manager as an attendance manager via isAttendanceManager()
-- (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'dtr_manager';
