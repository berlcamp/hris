-- Migration 028: Add composite "department_admin_and_department_head" role
--
-- This role grants the union of department_head and department_admin
-- permissions to a single user — useful when one person handles both roles
-- for the same department.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in
-- which it is added. RLS policies that reference this value live in the
-- next migration (029_update_rls_for_dept_admin_and_head.sql).
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'department_admin_and_department_head';
