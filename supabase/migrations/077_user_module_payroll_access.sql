-- Migration 077: per-user switch for a module manager's payroll WRITE access.
--
-- A JO Manager (and, once COS Payroll opens to it, a COS Manager) administers
-- one module end to end, and until now payroll came with that role
-- unconditionally: appointing someone JO Manager so they could maintain the
-- Job Order registry and area assignments also handed them the power to
-- create, edit and finalize payrolls — issued government records.
--
-- This splits the two. The role still decides which MODULE the account
-- reaches; this column decides whether, inside that module, payroll is
-- editable or read-only. Default TRUE, so every JO Manager that exists today
-- keeps exactly the access it has now and the flag only ever takes access
-- away deliberately. Same shape as migration 076's corrections switch.
--
-- Read-only means read-only, not hidden: the payroll list and detail pages
-- stay open so the manager can still look up and print a run. What closes is
-- every write — create, edit metadata, add/edit/remove members, finalize, and
-- duplicate (which creates a payroll). See canManageJobOrderPayroll in
-- src/lib/auth-helpers.ts.
--
-- Scope: the module-manager roles ONLY (jo_manager, cos_manager). super_admin
-- and hr_admin hold payroll through canManageJobOrders/canManageCos and are
-- unaffected — the column exists on their rows too, but nothing reads it for
-- them. Reopening and deleting a payroll were already super_admin-only
-- (canReopenOrDeletePayroll) and stay that way regardless of this flag.
--
-- Nothing in job_order_payrolls references this. Payrolls a manager created
-- before its access was revoked stay exactly as they are; the account simply
-- can no longer change them.

SET search_path TO hris, public, auth, extensions;

ALTER TABLE hris.user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_module_payroll boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN hris.user_profiles.can_manage_module_payroll IS
  'Module managers (jo_manager, cos_manager) only: may this account create and edit payrolls in its module, or is payroll read-only. Ignored for every other role.';
