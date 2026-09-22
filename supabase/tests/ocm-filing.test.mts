// Unit tests for the OCM-owner rule in src/lib/ocm-filing.ts — who may act on
// a leave or CTO that an OCM Admin filed.
//
// The rule is pinned here because it has already been wrong once in both
// directions. Written too loosely, a department head approves a filing that
// deliberately went around them. Written too tightly — which is how it shipped
// in June 2026 — the filing is locked to ONE person, and 31 leaves sat
// unapprovable by September because their filer was the only account in the
// system that could move them.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { ocmFilingBlocks, ocmFilingOwnerId } from "../../src/lib/ocm-filing.ts";
import type { UserRole } from "../../src/lib/types.ts";

const OCM_A = "ocm-admin-a";
const OCM_B = "ocm-admin-b";

const filedByOcmA = {
  created_by: OCM_A,
  created_by_profile: { role: "ocm_admin" },
};

function user(id: string, ...roles: UserRole[]) {
  return { id, roles };
}

test("ocmFilingOwnerId names the filer only when an OCM Admin filed it", () => {
  assert.equal(ocmFilingOwnerId(filedByOcmA), OCM_A);

  // PostgREST hands the embed back as an array in some shapes; both read alike.
  assert.equal(
    ocmFilingOwnerId({ created_by: OCM_A, created_by_profile: [{ role: "ocm_admin" }] }),
    OCM_A,
  );

  // Filed by anyone else — nobody owns it, so nobody is blocked.
  assert.equal(
    ocmFilingOwnerId({ created_by: "dept-admin", created_by_profile: { role: "department_admin" } }),
    null,
  );
  assert.equal(ocmFilingOwnerId({ created_by: "x", created_by_profile: null }), null);
  assert.equal(ocmFilingOwnerId({}), null);
});

test("the filing's own OCM Admin is never blocked", () => {
  assert.equal(ocmFilingBlocks(OCM_A, user(OCM_A, "ocm_admin")), false);
});

test("the approvers above the department act on it like any other filing", () => {
  for (const role of ["hr_admin", "super_admin", "ocm_admin"] as const) {
    assert.equal(
      ocmFilingBlocks(OCM_A, user(OCM_B, role)),
      false,
      `${role} must be able to act on an OCM Admin's filing`,
    );
  }
});

test("a department-scoped account is blocked — the filing went around it", () => {
  for (const role of [
    "department_head",
    "department_admin",
    "department_admin_and_department_head",
    "employee",
  ] as const) {
    assert.equal(
      ocmFilingBlocks(OCM_A, user("someone-else", role)),
      true,
      `${role} must not act on an OCM Admin's filing`,
    );
  }
});

test("a second role only ever adds the power, never removes it", () => {
  // A department head who is ALSO an HR Admin acts through the wider role.
  assert.equal(
    ocmFilingBlocks(OCM_A, user("both", "department_head", "hr_admin")),
    false,
  );
});

test("a filing no OCM Admin made blocks nobody", () => {
  assert.equal(ocmFilingBlocks(null, user("dept", "department_head")), false);
  assert.equal(ocmFilingBlocks(undefined, user("dept", "department_head")), false);
});
