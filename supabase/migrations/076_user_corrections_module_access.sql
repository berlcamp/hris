-- Migration 076: per-user switch for a Department Admin's Attendance
-- Corrections access.
--
-- Filing corrections is the one delegated power in the module: everything else
-- a Department Admin does is read-only or lives in its own department's
-- records, but a correction rewrites attendance that payroll is computed from.
-- Until now the role carried it unconditionally — appointing someone a
-- Department Admin for the ordinary reasons (they maintain the department's
-- employee records) also handed them the corrections queue.
--
-- This makes it a per-ACCOUNT decision instead of a per-role one, set on the
-- user's own row rather than on a list HR maintains elsewhere. Default TRUE, so
-- every Department Admin that exists today keeps exactly the access it has now
-- and the flag only ever takes access away deliberately.
--
-- Scope: the dept-admin roles ONLY (department_admin and the composite
-- department_admin_and_department_head — see isDeptAdmin in
-- src/lib/auth-helpers.ts). Reviewers (super_admin, hr_admin, dtr_manager), the
-- direct-apply OCM Admin and the read-only Department Head are unaffected: the
-- column exists on their rows too, but nothing reads it for them. Turning it
-- off closes the route, the queue and the wizard for that account — see
-- canFileAttendanceCorrection / canOpenAttendanceCorrections.
--
-- Nothing in attendance_correction_requests references this. Requests a
-- Department Admin filed before its access was revoked stay live and remain
-- reviewable by HR; the account simply can no longer open the module to see
-- them.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.user_profiles
  ADD COLUMN IF NOT EXISTS can_access_attendance_corrections boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN hris.user_profiles.can_access_attendance_corrections IS
  'Department Admin only: may this account open the Attendance Corrections module. Ignored for every other role.';
