-- Migration 034: Add "ocm_admin" role
--
-- OCM Admin is a read-all role for the Leave module: it sees every leave
-- application across all departments and at every stage, exactly like
-- super_admin (in contrast to hr_admin, which only sees dept-head-approved
-- leaves). App-side leave reads (getLeaveApplications / getLeaveApplicationById
-- in src/lib/actions/leave-actions.ts) treat ocm_admin as an unfiltered role.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'ocm_admin';
