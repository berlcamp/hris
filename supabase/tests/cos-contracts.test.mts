// Schema-level tests for hris.cos_contracts against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// These prove the constraints the app relies on but cannot enforce itself:
// the exclusion constraint on overlapping periods, the renew-once UNIQUE, the
// termination CHECKs, and ON DELETE RESTRICT from contract to employee.
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

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";
const EXCLUSION_VIOLATION = "23P01";

const PREFIX = "TEST-CONTRACT-";
// Matches src/lib/cos-contract-doc.ts's EMPTY_CONTRACT_DOC: the ProseMirror
// `doc` node's content spec is `block+`, so `{ content: [] }` is not actually
// a valid doc (Node.check() throws on it) even though nothing in these DB
// tests enforces that schema — kept in sync so this fixture doesn't drift
// back into asserting a shape the real app no longer writes.
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** Creates a throwaway COS employee and returns its id. */
async function makeEmployee(suffix: string): Promise<string> {
  const { data, error } = await admin
    .from("cos_employees")
    .insert({
      cos_no: `${PREFIX}${suffix}`,
      first_name: "Test",
      last_name: "Contract",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

interface ContractOverrides {
  period_start?: string;
  period_end?: string;
  status?: string;
  terminated_on?: string | null;
  renewed_from_id?: string | null;
}

async function insertContract(
  employeeId: string,
  overrides: ContractOverrides = {},
) {
  return admin
    .from("cos_contracts")
    .insert({
      cos_employee_id: employeeId,
      period_start: overrides.period_start ?? "2026-01-01",
      period_end: overrides.period_end ?? "2026-06-30",
      body: EMPTY_DOC,
      ...overrides,
    })
    .select("id")
    .single();
}

test.after(async () => {
  const { data } = await admin
    .from("cos_employees")
    .select("id")
    .like("cos_no", `${PREFIX}%`);
  for (const row of data ?? []) {
    await admin.from("cos_contracts").delete().eq("cos_employee_id", row.id);
    await admin.from("cos_employees").delete().eq("id", row.id);
  }
});

test("overlapping periods for one employee are rejected", async () => {
  const emp = await makeEmployee("overlap");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  const second = await insertContract(emp, {
    period_start: "2026-06-30",
    period_end: "2026-12-31",
  });
  assert.equal(second.error?.code, EXCLUSION_VIOLATION);
});

test("adjacent periods are accepted", async () => {
  const emp = await makeEmployee("adjacent");
  assert.equal((await insertContract(emp)).error, null);
  const next = await insertContract(emp, {
    period_start: "2026-07-01",
    period_end: "2026-12-31",
  });
  assert.equal(next.error, null);
});

test("early termination frees the remaining period", async () => {
  const emp = await makeEmployee("terminate-frees");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  const upd = await admin
    .from("cos_contracts")
    .update({ status: "terminated", terminated_on: "2026-03-31" })
    .eq("id", first.data!.id);
  assert.equal(upd.error, null);

  const replacement = await insertContract(emp, {
    period_start: "2026-04-01",
    period_end: "2026-06-30",
  });
  assert.equal(replacement.error, null);
});

test("a soft-deleted contract does not block reusing its period", async () => {
  const emp = await makeEmployee("softdel");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  await admin
    .from("cos_contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", first.data!.id);

  const again = await insertContract(emp);
  assert.equal(again.error, null);
});

test("two employees may hold contracts over the same dates", async () => {
  const a = await makeEmployee("emp-a");
  const b = await makeEmployee("emp-b");
  assert.equal((await insertContract(a)).error, null);
  assert.equal((await insertContract(b)).error, null);
});

test("a contract cannot be renewed twice", async () => {
  const emp = await makeEmployee("renew-once");
  const source = await insertContract(emp);
  assert.equal(source.error, null);

  const firstRenewal = await insertContract(emp, {
    period_start: "2026-07-01",
    period_end: "2026-12-31",
    renewed_from_id: source.data!.id,
  });
  assert.equal(firstRenewal.error, null);

  const secondRenewal = await insertContract(emp, {
    period_start: "2027-01-01",
    period_end: "2027-06-30",
    renewed_from_id: source.data!.id,
  });
  assert.equal(secondRenewal.error?.code, UNIQUE_VIOLATION);
});

test("terminated status requires a termination date", async () => {
  const emp = await makeEmployee("term-nodate");
  const res = await insertContract(emp, { status: "terminated" });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("a termination date requires terminated status", async () => {
  const emp = await makeEmployee("date-nostatus");
  const res = await insertContract(emp, { terminated_on: "2026-03-31" });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("termination date outside the period is rejected", async () => {
  const emp = await makeEmployee("term-outside");
  const res = await insertContract(emp, {
    status: "terminated",
    terminated_on: "2026-09-30",
  });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("period_end before period_start is rejected", async () => {
  const emp = await makeEmployee("bad-order");
  const res = await insertContract(emp, {
    period_start: "2026-06-30",
    period_end: "2026-01-01",
  });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("hard-deleting an employee who holds a contract is blocked", async () => {
  const emp = await makeEmployee("restrict");
  assert.equal((await insertContract(emp)).error, null);

  const del = await admin.from("cos_employees").delete().eq("id", emp);
  assert.equal(del.error?.code, FK_VIOLATION);
});

test("soft-deleting an employee leaves their contracts readable", async () => {
  const emp = await makeEmployee("softdel-emp");
  assert.equal((await insertContract(emp)).error, null);

  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", emp);

  const { data, error } = await admin
    .from("cos_contracts")
    .select("id")
    .eq("cos_employee_id", emp)
    .is("deleted_at", null);
  assert.equal(error, null);
  assert.equal(data?.length, 1);
});
