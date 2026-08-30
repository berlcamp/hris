// Stack tests for the multiple-roles columns on hris.user_profiles
// (migration 087), against real Postgres + PostgREST.
//
// Everything here is a guarantee the application LEANS ON and cannot check for
// itself, because the work happens in a trigger:
//
//   * `role` is derived from `roles`, always, whichever column was written.
//     Every RLS policy in 007/029 reads `role`, and ~60 scope branches in the
//     server actions read it too — if it ever disagreed with the array, an
//     account's data reach and its permissions would come apart.
//   * A write that names only `role` — the legacy shape, and anything from a
//     client that predates this migration — still produces the right array.
//     This is what makes the migration safe to deploy ahead of the code.
//   * `roles` is never empty, never duplicated, and always ordered widest-first.
//   * hris.user_role_rank agrees with ROLE_PRECEDENCE in
//     src/lib/auth-helpers.ts. That pair is the one genuine cross-boundary
//     invariant in this feature: the database picks the primary role on write,
//     the application picks it on read, and nothing else would catch a drift.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ROLE_PRECEDENCE, primaryRole } from "../../src/lib/auth-helpers.ts";
import type { UserRole } from "../../src/lib/types.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

let seq = 0;
const emails: string[] = [];

/** Inserts a profile with whatever columns the caller names, and returns it. */
async function insertProfile(fields: Record<string, unknown>) {
  const email = `roles-test-${Date.now()}-${seq++}@test.local`;
  emails.push(email);
  const { data, error } = await admin
    .from("user_profiles")
    .insert({ email, full_name: "Roles Test", ...fields })
    .select("id, role, roles")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; role: UserRole; roles: UserRole[] };
}

async function update(id: string, fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("user_profiles")
    .update(fields)
    .eq("id", id)
    .select("role, roles")
    .single();
  if (error) throw new Error(error.message);
  return data as { role: UserRole; roles: UserRole[] };
}

test.after(async () => {
  if (emails.length) await admin.from("user_profiles").delete().in("email", emails);
});

// ── role is derived from roles ───────────────────────────────────────

test("role is the widest of the roles written", async () => {
  const row = await insertProfile({
    roles: ["jo_manager", "hr_admin", "department_head"],
  });
  assert.equal(row.role, "hr_admin");
});

test("role follows when roles is updated", async () => {
  const row = await insertProfile({ roles: ["hr_admin"] });
  const after = await update(row.id, { roles: ["employee", "department_admin"] });
  assert.equal(after.role, "department_admin");
  assert.deepEqual(after.roles, ["department_admin", "employee"]);
});

// ── A legacy write that names only `role` ────────────────────────────
// The migration has to be safe to apply BEFORE the new code is deployed, so a
// write from the old client must not quietly turn the account into an Employee.

test("an insert naming only role builds the array from it", async () => {
  const row = await insertProfile({ role: "dtr_manager" });
  assert.deepEqual(row.roles, ["dtr_manager"]);
  assert.equal(row.role, "dtr_manager");
});

test("an update naming only role rebuilds the array from it", async () => {
  const row = await insertProfile({ roles: ["hr_admin", "employee"] });
  const after = await update(row.id, { role: "cos_manager" });
  assert.deepEqual(after.roles, ["cos_manager"]);
  assert.equal(after.role, "cos_manager");
});

test("an insert naming neither column falls back to employee", async () => {
  const row = await insertProfile({});
  assert.equal(row.role, "employee");
  assert.deepEqual(row.roles, ["employee"]);
});

// ── The array is a normalized set ────────────────────────────────────

test("roles is deduplicated and ordered widest-first", async () => {
  const row = await insertProfile({
    roles: ["employee", "hr_admin", "employee", "department_head"],
  });
  assert.deepEqual(row.roles, ["hr_admin", "department_head", "employee"]);
});

test("an empty array falls back to the scalar rather than being stored", async () => {
  const row = await insertProfile({ role: "ocm_admin" });
  const after = await update(row.id, { roles: [] });
  assert.deepEqual(after.roles, ["ocm_admin"]);
  assert.equal(after.role, "ocm_admin");
});

// ── The database and the application agree on the primary role ───────

// Every ordered pair, so a single misplaced rank on either side shows up as a
// named failure rather than as a subtle scoping bug months later.
test("user_role_rank orders exactly like ROLE_PRECEDENCE", async () => {
  for (const a of ROLE_PRECEDENCE) {
    for (const b of ROLE_PRECEDENCE) {
      if (a === b) continue;
      const row = await insertProfile({ roles: [a, b] });
      assert.equal(
        row.role,
        primaryRole([a, b]),
        `database and ROLE_PRECEDENCE disagree on [${a}, ${b}]`,
      );
      // The stored order must match the application's ranking too, so the UI
      // renders the badges in the same order the database sorted them.
      assert.deepEqual(
        row.roles,
        [a, b].sort(
          (x, y) => ROLE_PRECEDENCE.indexOf(x) - ROLE_PRECEDENCE.indexOf(y),
        ),
        `stored order differs for [${a}, ${b}]`,
      );
    }
  }
});
