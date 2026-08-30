// Unit tests for the multiple-roles primitives in src/lib/auth-helpers.ts
// (migration 087).
//
// An account holds a SET of roles now. Two rules carry the whole design, and
// both are easy to get backwards, so they are pinned here:
//
//   1. A GRANT is the union over the account's roles. A second role can only
//      ever add a power, never take one away.
//   2. The PRIMARY role — what user_profiles.role stores, and what the "how
//      much data does this account see" branches read — is the WIDEST role the
//      account holds. Ranking any other way would either hide records an
//      account is entitled to (scoping an HR Admin to one department because
//      they also head it) or hand a narrow role the run of the system.
//
// ROLE_PRECEDENCE is mirrored by hris.user_role_rank in migration 087. The two
// must agree, or `role` in the database and `primaryRole()` in the application
// would name different roles for the same account.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_PRECEDENCE,
  canManageEvents,
  canManageHrRecords,
  canManageJobOrders,
  canScanEvents,
  hasAnyRole,
  hasEveryRole,
  hasRole,
  isDeptHead,
  isScanOnlyAccount,
  normalizeRoles,
  primaryRole,
  toRoleList,
} from "../../src/lib/auth-helpers.ts";
import type { UserRole } from "../../src/lib/types.ts";

// ── toRoleList ──────────────────────────────────────────────────────

test("toRoleList accepts one role, a list, or nothing", () => {
  assert.deepEqual(toRoleList("hr_admin"), ["hr_admin"]);
  assert.deepEqual(toRoleList(["hr_admin", "employee"]), [
    "hr_admin",
    "employee",
  ]);
  assert.deepEqual(toRoleList(null), []);
  assert.deepEqual(toRoleList(undefined), []);
});

// ── hasRole / hasAnyRole / hasEveryRole ─────────────────────────────

test("hasRole finds a role anywhere in the set", () => {
  const roles: UserRole[] = ["hr_admin", "department_head"];
  assert.equal(hasRole(roles, "department_head"), true);
  assert.equal(hasRole(roles, "super_admin"), false);
  assert.equal(hasRole(null, "hr_admin"), false);
});

test("hasAnyRole is an OR, hasEveryRole an AND", () => {
  const roles: UserRole[] = ["jo_manager", "employee"];
  assert.equal(hasAnyRole(roles, "super_admin", "jo_manager"), true);
  assert.equal(hasAnyRole(roles, "super_admin", "hr_admin"), false);
  assert.equal(hasEveryRole(roles, "jo_manager", "employee"), true);
  assert.equal(hasEveryRole(roles, "jo_manager", "hr_admin"), false);
});

test("an empty role set holds nothing", () => {
  assert.equal(hasAnyRole([], "super_admin", "employee"), false);
  assert.equal(hasEveryRole([], "employee"), false);
});

// ── Grants are the union over the account's roles ────────────────────

test("a grant reaches an account through any one of its roles", () => {
  const roles: UserRole[] = ["employee", "jo_manager"];
  assert.equal(canManageJobOrders(roles), true);
  // ...and nothing the other role lacks comes along with it.
  assert.equal(canManageHrRecords(roles), false);
});

test("adding a role never removes a power", () => {
  const before: UserRole[] = ["hr_admin"];
  const after: UserRole[] = ["hr_admin", "employee"];
  for (const grant of [canManageHrRecords, canManageEvents, canManageJobOrders]) {
    assert.equal(grant(before), grant(after), grant.name);
  }
});

test("a single role still works wherever a set is expected", () => {
  assert.equal(canManageHrRecords("hr_admin"), true);
  assert.equal(isDeptHead("department_admin_and_department_head"), true);
  assert.equal(canScanEvents("event_attendance_officer"), true);
});

// ── primaryRole ─────────────────────────────────────────────────────

test("the primary role is the widest one held", () => {
  assert.equal(primaryRole(["employee", "hr_admin"]), "hr_admin");
  assert.equal(primaryRole(["jo_manager", "department_admin"]), "department_admin");
  assert.equal(primaryRole(["department_head", "department_admin"]), "department_head");
  assert.equal(primaryRole(["employee"]), "employee");
});

test("primaryRole does not depend on the order given", () => {
  assert.equal(primaryRole(["employee", "ocm_admin"]), "ocm_admin");
  assert.equal(primaryRole(["ocm_admin", "employee"]), "ocm_admin");
});

test("primaryRole is null for no roles at all", () => {
  assert.equal(primaryRole([]), null);
  assert.equal(primaryRole(null), null);
  assert.equal(primaryRole(undefined), null);
});

// An unknown value — a role added to the database but not yet to the union —
// must not outrank a real one, or a stale deployment would widen an account.
test("an unrecognized role sorts last", () => {
  const roles: UserRole[] = ["not_a_role" as UserRole, "employee"];
  assert.equal(primaryRole(roles), "employee");
  assert.equal(primaryRole(["not_a_role" as UserRole]), "not_a_role");
});

test("ROLE_PRECEDENCE lists every role exactly once", () => {
  assert.equal(
    new Set(ROLE_PRECEDENCE).size,
    ROLE_PRECEDENCE.length,
    "duplicate entry",
  );
  assert.equal(ROLE_PRECEDENCE[0], "super_admin", "super_admin must rank first");
  assert.equal(
    ROLE_PRECEDENCE[ROLE_PRECEDENCE.length - 1],
    "employee",
    "employee must rank last",
  );
});

// ── isScanOnlyAccount ───────────────────────────────────────────────
// The Checker redirect sends an account out of the dashboard entirely, so it
// must catch ONLY the account that has nothing else to do here.

test("the Checker alone is a scan-only account", () => {
  assert.equal(isScanOnlyAccount(["event_attendance_officer"]), true);
  assert.equal(isScanOnlyAccount("event_attendance_officer"), true);
});

test("a Checker who also holds another role keeps the dashboard", () => {
  assert.equal(
    isScanOnlyAccount(["event_attendance_officer", "employee"]),
    false,
    "employee ranks below the Checker — a precedence-based test would fail here",
  );
  assert.equal(
    isScanOnlyAccount(["event_attendance_officer", "hr_admin"]),
    false,
  );
});

test("no roles is not a scan-only account", () => {
  assert.equal(isScanOnlyAccount([]), false);
  assert.equal(isScanOnlyAccount(null), false);
});

// ── normalizeRoles ──────────────────────────────────────────────────
// A row read without the array — an old select, a cached row — must keep the
// access its scalar role grants rather than silently losing all of it.

test("normalizeRoles prefers the array", () => {
  assert.deepEqual(
    normalizeRoles(["hr_admin", "department_head"], "hr_admin"),
    ["hr_admin", "department_head"],
  );
});

test("normalizeRoles falls back to the scalar role", () => {
  assert.deepEqual(normalizeRoles(null, "dtr_manager"), ["dtr_manager"]);
  assert.deepEqual(normalizeRoles(undefined, "dtr_manager"), ["dtr_manager"]);
  assert.deepEqual(normalizeRoles([], "dtr_manager"), ["dtr_manager"]);
});

test("normalizeRoles yields nothing when there is nothing to read", () => {
  assert.deepEqual(normalizeRoles(null, null), []);
  assert.deepEqual(normalizeRoles([], undefined), []);
});

test("normalizeRoles drops junk entries", () => {
  assert.deepEqual(normalizeRoles(["hr_admin", "", null, 7], "employee"), [
    "hr_admin",
  ]);
});
