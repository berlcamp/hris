// Schema-level tests for hris.cos_employees against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// These prove the constraints the app relies on but cannot enforce itself:
// the partial unique index on cos_no (live rows only), the CHECK constraints,
// the ON DELETE RESTRICT on department_id, and the updated_at trigger.
//
// Credentials come from `supabase status -o json` and are never printed.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npm run db:start && npm run test:cos-db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", {
    cwd: PROJECT_DIR,
    encoding: "utf8",
  }),
);

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql — "Office of the City Mayor".
const DEPT = "00000000-0000-0000-0000-0000000000d1";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";

// Every row this suite creates carries a recognisable cos_no prefix so cleanup
// cannot touch anything else.
const PREFIX = "TEST-COS-";

async function cleanup() {
  await admin.from("cos_employees").delete().like("cos_no", `${PREFIX}%`);
}

function newEmployee(cosNo: string, overrides: Record<string, unknown> = {}) {
  return {
    cos_no: cosNo,
    first_name: "Juan",
    last_name: "Dela Cruz",
    department_id: DEPT,
    ...overrides,
  };
}

test.before(cleanup);
test.after(cleanup);

test("inserts a COS employee with status defaulting to active", async () => {
  const { data, error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}001`))
    .select()
    .single();

  assert.equal(error, null);
  assert.equal(data.status, "active");
  assert.equal(data.deleted_at, null);
});

test("rejects a duplicate cos_no among live rows", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}002`));

  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}002`));

  assert.equal(error?.code, UNIQUE_VIOLATION);
});

test("accepts the same cos_no once the holder is soft-deleted", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}003`));
  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("cos_no", `${PREFIX}003`);

  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}003`));

  assert.equal(error, null);
});

test("rejects an out-of-range sex", async () => {
  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}004`, { sex: "unknown" }));

  assert.equal(error?.code, CHECK_VIOLATION);
});

test("rejects an out-of-range status", async () => {
  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}005`, { status: "archived" }));

  assert.equal(error?.code, CHECK_VIOLATION);
});

test("rejects a department_id that does not exist", async () => {
  const { error } = await admin.from("cos_employees").insert(
    newEmployee(`${PREFIX}006`, {
      department_id: "00000000-0000-0000-0000-00000000dead",
    }),
  );

  assert.equal(error?.code, FK_VIOLATION);
});

test("advances updated_at on UPDATE", async () => {
  const { data: created } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}007`))
    .select()
    .single();

  await new Promise((r) => setTimeout(r, 10));

  const { data: updated } = await admin
    .from("cos_employees")
    .update({ remarks: "touched" })
    .eq("id", created.id)
    .select()
    .single();

  assert.ok(
    new Date(updated.updated_at) > new Date(created.updated_at),
    "updated_at should advance",
  );
});

test("a soft-deleted row is invisible to a deleted_at IS NULL read", async () => {
  const { data: created } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}010`))
    .select()
    .single();

  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", created.id);

  const { data: live } = await admin
    .from("cos_employees")
    .select("id")
    .is("deleted_at", null)
    .eq("id", created.id)
    .maybeSingle();

  assert.equal(live, null);
});

test("the department join returns name and code", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}011`));

  const { data, error } = await admin
    .from("cos_employees")
    .select("id, cos_no, departments(name, code)")
    .is("deleted_at", null)
    .eq("cos_no", `${PREFIX}011`)
    .single()
    // Without a generated Database type, supabase-js can't tell this is a
    // to-one embed (FK on cos_employees, not on departments) and infers
    // `departments` as an array. Runtime returns a single object — this
    // just corrects the static type to match, it doesn't change what's
    // asserted below.
    .returns<{
      id: string;
      cos_no: string;
      departments: { name: string; code: string } | null;
    }>();

  assert.equal(error, null);
  assert.equal(data.departments?.code, "OCM");
});

test("hard-deleting a referenced department is blocked", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}012`));

  const { error } = await admin.from("departments").delete().eq("id", DEPT);

  assert.equal(error?.code, FK_VIOLATION);
});
