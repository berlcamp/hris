-- Migration 057: Add "cos_manager" role.
--
-- COS Manager is a dedicated Contract of Service role: it manages the COS
-- employee registry, contracts and renewals, contract templates, and COS
-- payroll. It carries NO other access: no plantilla employees, attendance/DTR,
-- leave, CTO/COC, RSP, regular or JO payroll, reports, or any other
-- administration tool. App-side authorization treats cos_manager via
-- canManageCos() (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added. That is why this is its own migration, ahead of 058.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'cos_manager';
