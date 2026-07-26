-- Migration 055: Add "jo_manager" role.
--
-- JO Manager is a dedicated Job Orders role: it manages Job Order employees and
-- Area Assignments, and (from Specs 2 and 3) creates payrolls, memos and special
-- orders. It carries NO other access — no employees, attendance/DTR, leave,
-- CTO/COC, RSP, regular payroll, reports or administration tools.
-- App-side authorization treats jo_manager via canManageJobOrders()
-- (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added. That is why the Job Orders tables live in migration 056.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'jo_manager';
