// End-to-end tests for the Job Order PAYROLL schema
// (`hris.job_order_payrolls` / `hris.job_order_payroll_members`) against the
// LOCAL Supabase stack (real Postgres + real PostgREST).
//
// job-order-payroll-helpers.test.mts and job-order-payroll-import.test.mts
// already prove the pure logic (countWeekdays, deriveAreasLabel,
// planJobOrderPayrollImport) with zero database dependency. This file proves
// the claims only a real database can answer — the same tier that, on the
// sibling Job Orders roster (migrations 056/059/060), caught a `42P10` upsert
// failure and a missing-RLS PII leak that eight prior task gates missed:
//
//   * RLS actually blocks the anon key — the browser-bundled key — from both
//     tables. These rows carry LandBank account numbers and SSS numbers.
//   * legacy_id upsert is idempotent on BOTH tables, against the NON-PARTIAL
//     index migration 064 deliberately used (the migration-059 lesson).
//   * chk_job_order_payroll_period and the status CHECK are enforced by
//     Postgres, not just by the zod schema.
//   * UNIQUE (payroll_id, job_order_employee_id) blocks a double-add but
//     still allows unlimited unlinked (NULL) member rows.
//   * ON DELETE SET NULL on job_order_employee_id preserves the frozen
//     snapshot when a JO is deleted — the whole reason the member table
//     duplicates every printable field instead of joining live.
//   * ON DELETE CASCADE removes a payroll's members with it.
//   * A soft-deleted JO is still resolvable by legacy_id — the path 5,893 of
//     11,015 legacy member rows depend on (see job-order-payroll-import.ts).
//   * The denormalized `areas` label actually lands in the column after a
//     membership change, driven by the real `recomputeAreas()`.
//   * A poisoned row inside one upsert chunk fails that chunk without
//     aborting the rest of the import, driven by the real
//     `upsertLegacyChunks()`.
//
// The last two used to re-run *copies* of the production logic, because both
// lived inside `"use server"` modules and `next/cache` / `next/headers` cannot
// be resolved by Node's plain ESM loader with no Next bundler in the loop. Both
// now live in the plain `src/lib/job-order-payroll-repo.ts` and are imported
// and called directly, so a drift in either would fail these tests.
//
// Still out of reach, and deliberately so: `importJobOrderPayrollCsv()` itself
// (job-order-payroll-import-actions.ts) requires a signed-in super_admin
// session via `getCurrentUser()`, which has no meaning outside a real Next.js
// request. What it does with the database beyond auth, roster load and the pure
// planning layer is exactly `upsertLegacyChunks`, which is covered here.
//
// Credentials come from `supabase status -o json` and are never printed.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npx supabase start && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  recomputeAreas,
  upsertLegacyChunks,
  type PayrollDbClient,
} from "../../src/lib/job-order-payroll-repo.ts";

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

// Unauthenticated client using only the public anon key — this is exactly
// what ships in the browser bundle. Proves RLS (migration 064), not just app
// code: migration 020 grants SELECT on every hris table to `anon`, so without
// RLS enabled on job_order_payrolls / job_order_payroll_members this client
// would read LandBank account numbers and SSS numbers straight from
// PostgREST regardless of what the Next.js server actions enforce.
const anon = createClient(status.API_URL, status.ANON_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// The production functions in job-order-payroll-repo.ts are typed against
// `ReturnType<typeof createAdminClient>`. This file's `admin` handle is the
// same `createClient` call with the same service-role key, differing only in
// that it defaults `db.schema` to hris — the repo functions call `.schema("hris")`
// explicitly anyway, so the handle is interchangeable at runtime. Cast once here
// rather than at every call site.
const adminRepo = admin as unknown as PayrollDbClient;

const TAG = `jopaytest-${Date.now()}`;

// Monotonic per-run counter so every legacy_id minted in this file is unique,
// even across tests that both need a "fresh, definitely-not-taken" id.
let legacyIdSeq = 0;
function freshLegacyId() {
  legacyIdSeq += 1;
  return Number(`${Date.now()}`.slice(-9)) * 1000 + legacyIdSeq;
}

async function makeArea(name: string) {
  const { data, error } = await admin
    .from("job_order_areas")
    .insert({ name })
    .select("id, name")
    .single();
  assert.equal(error, null, `area insert failed: ${error?.message}`);
  return data!;
}

async function makeJo(areaId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} JO ${legacyIdSeq}`,
      area_id: areaId,
      daily_rate: 400,
      ...overrides,
    })
    .select("id, full_name, daily_rate")
    .single();
  assert.equal(error, null, `job_order_employees insert failed: ${error?.message}`);
  return data!;
}

async function makePayroll(overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("job_order_payrolls")
    .insert({
      period_start: "2026-01-01",
      period_end: "2026-01-15",
      description: `${TAG}-payroll`,
      status: "draft",
      ...overrides,
    })
    .select("id, legacy_id, description, areas, status")
    .single();
  assert.equal(error, null, `job_order_payrolls insert failed: ${error?.message}`);
  return data!;
}

async function makeMember(payrollId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("job_order_payroll_members")
    .insert({
      payroll_id: payrollId,
      full_name: `${TAG} Member ${legacyIdSeq}`,
      daily_rate: 400,
      ...overrides,
    })
    .select("*")
    .single();
  assert.equal(error, null, `job_order_payroll_members insert failed: ${error?.message}`);
  return data!;
}

test.after(async () => {
  // Payrolls first: ON DELETE CASCADE takes every member row with it, so
  // there is nothing left pointing at our tagged employees afterward.
  await admin.from("job_order_payrolls").delete().like("description", `${TAG}%`);
  await admin.from("job_order_employees").delete().like("full_name", `${TAG}%`);
  await admin.from("job_order_areas").delete().like("name", `${TAG}%`);
});

// 1. RLS — the reason this file needs an anon client at all.
//
// A bare `.select("id").limit(1)` against a table that (after `db:reset`)
// holds zero rows would return `[]` whether RLS blocks the anon client or
// RLS is completely disabled — that ambiguity is exactly the blind spot that
// let Spec 1's Job Order PII leak survive nine task gates. To be load-bearing
// this must: insert a KNOWN row via `admin`, have `anon` look it up BY ID (not
// an unfiltered scan), assert zero rows come back, and then assert `admin`
// can still see that same row — proving the row genuinely exists and is
// genuinely invisible to `anon`, not merely absent. Mirrors
// job-orders.test.mts's "anon key cannot read job_order_employees" test.
test("anon key cannot read job_order_payrolls", async () => {
  const payroll = await makePayroll({ description: `${TAG}-rls-payroll` });

  const anonRead = await anon.from("job_order_payrolls").select("id").eq("id", payroll.id);
  assert.equal(anonRead.error, null, `anon select should not error, just return nothing: ${anonRead.error?.message}`);
  assert.equal(anonRead.data!.length, 0, "anon (unauthenticated) client must see zero rows once RLS is enabled");

  const adminRead = await admin.from("job_order_payrolls").select("id").eq("id", payroll.id);
  assert.equal(adminRead.error, null, `admin select failed: ${adminRead.error?.message}`);
  assert.equal(adminRead.data!.length, 1, "admin (service-role) client bypasses RLS and must still see the row");
});

test("anon key cannot read job_order_payroll_members", async () => {
  const area = await makeArea(`${TAG}-area-rls-members`);
  const jo = await makeJo(area.id, { full_name: `${TAG} RLS Member Probe` });
  const payroll = await makePayroll({ description: `${TAG}-rls-members` });
  const member = await makeMember(payroll.id, {
    job_order_employee_id: jo.id,
    full_name: jo.full_name,
    sss_no: "01-2345678-9",
    legacy_id: freshLegacyId(),
  });

  const anonRead = await anon.from("job_order_payroll_members").select("id, full_name, sss_no").eq("id", member.id);
  assert.equal(anonRead.error, null, `anon select should not error, just return nothing: ${anonRead.error?.message}`);
  assert.equal(anonRead.data!.length, 0, "anon (unauthenticated) client must see zero rows once RLS is enabled");

  const adminRead = await admin.from("job_order_payroll_members").select("id").eq("id", member.id);
  assert.equal(adminRead.error, null, `admin select failed: ${adminRead.error?.message}`);
  assert.equal(adminRead.data!.length, 1, "admin (service-role) client bypasses RLS and must still see the row");
});

// 2. The migration 059 regression pin, on BOTH tables. A partial unique index
//    on legacy_id cannot be inferred by .upsert({onConflict}) and fails 42P10.
test("upserting the same payroll legacy_id twice updates in place", async () => {
  const legacyId = freshLegacyId();
  const row = {
    legacy_id: legacyId,
    period_start: "2026-01-01",
    period_end: "2026-01-15",
    description: `${TAG}-first`,
  };
  const a = await admin.from("job_order_payrolls").upsert(row, { onConflict: "legacy_id" }).select("id");
  assert.equal(a.error, null);
  const b = await admin
    .from("job_order_payrolls")
    .upsert({ ...row, description: `${TAG}-second` }, { onConflict: "legacy_id" })
    .select("id");
  assert.equal(b.error, null);
  const { data } = await admin.from("job_order_payrolls").select("id, description").eq("legacy_id", legacyId);
  assert.equal(data!.length, 1);
  assert.equal(data![0].description, `${TAG}-second`);
});

test("upserting the same payroll_member legacy_id twice updates in place", async () => {
  const payroll = await makePayroll();
  const legacyId = freshLegacyId();
  const row = {
    legacy_id: legacyId,
    payroll_id: payroll.id,
    full_name: `${TAG}-member-first`,
    daily_rate: 400,
  };
  const a = await admin
    .from("job_order_payroll_members")
    .upsert(row, { onConflict: "legacy_id" })
    .select("id");
  assert.equal(a.error, null, `first upsert failed: ${a.error?.message}`);
  const b = await admin
    .from("job_order_payroll_members")
    .upsert({ ...row, full_name: `${TAG}-member-second`, daily_rate: 450 }, { onConflict: "legacy_id" })
    .select("id");
  assert.equal(b.error, null, `second upsert failed: ${b.error?.message}`);

  const { data } = await admin
    .from("job_order_payroll_members")
    .select("id, full_name, daily_rate")
    .eq("legacy_id", legacyId);
  assert.equal(data!.length, 1, "re-upsert must not duplicate the member row");
  assert.equal(data![0].full_name, `${TAG}-member-second`);
  assert.equal(Number(data![0].daily_rate), 450);
});

// 3. Two NULL legacy_id rows must coexist (hand-created payrolls). Postgres
//    treats NULL as distinct from every other NULL, so the non-partial
//    unique index on legacy_id must not block this.
test("two payrolls with a NULL legacy_id coexist", async () => {
  const a = await makePayroll({ description: `${TAG}-nulla`, legacy_id: null });
  const b = await makePayroll({ description: `${TAG}-nullb`, legacy_id: null });
  assert.equal(a.legacy_id, null);
  assert.equal(b.legacy_id, null);

  const { data, error } = await admin
    .from("job_order_payrolls")
    .select("id")
    .is("legacy_id", null)
    .in("id", [a.id, b.id]);
  assert.equal(error, null);
  assert.equal(data!.length, 2, "both NULL-legacy_id payrolls must exist simultaneously");
});

// 4. chk_job_order_payroll_period rejects a reversed period — the constraint
//    that forces the importer to pre-validate legacy payroll 11.
test("chk_job_order_payroll_period rejects a reversed period", async () => {
  const { error } = await admin
    .from("job_order_payrolls")
    .insert({
      description: `${TAG}-reversed`,
      period_start: "2026-01-15",
      period_end: "2026-01-01",
    })
    .select()
    .single();

  assert.ok(error, "expected the CHECK constraint to reject a reversed period");
  assert.equal(error!.code, "23514");
});

// 5. UNIQUE (payroll_id, job_order_employee_id) rejects a double-add...
test("UNIQUE (payroll_id, job_order_employee_id) rejects adding the same JO twice", async () => {
  const area = await makeArea(`${TAG}-area-dup`);
  const jo = await makeJo(area.id);
  const payroll = await makePayroll({ description: `${TAG}-dupadd` });

  await makeMember(payroll.id, {
    job_order_employee_id: jo.id,
    full_name: jo.full_name,
    daily_rate: jo.daily_rate,
    legacy_id: freshLegacyId(),
  });

  const { error } = await admin
    .from("job_order_payroll_members")
    .insert({
      payroll_id: payroll.id,
      job_order_employee_id: jo.id,
      full_name: jo.full_name,
      daily_rate: jo.daily_rate,
      legacy_id: freshLegacyId(),
    })
    .select()
    .single();

  assert.ok(error, "expected the UNIQUE constraint to reject a second membership row for the same JO");
  assert.equal(error!.code, "23505");
});

// 6. ...but permits many rows with a NULL job_order_employee_id.
test("many member rows with a NULL job_order_employee_id are all permitted", async () => {
  const payroll = await makePayroll({ description: `${TAG}-nullmembers` });

  const a = await makeMember(payroll.id, {
    job_order_employee_id: null,
    full_name: `${TAG} Manual A`,
    legacy_id: freshLegacyId(),
  });
  const b = await makeMember(payroll.id, {
    job_order_employee_id: null,
    full_name: `${TAG} Manual B`,
    legacy_id: freshLegacyId(),
  });

  const { data, error } = await admin
    .from("job_order_payroll_members")
    .select("id")
    .eq("payroll_id", payroll.id)
    .is("job_order_employee_id", null);
  assert.equal(error, null);
  assert.equal(data!.length, 2, "both NULL-employee member rows must coexist under the same payroll");
  assert.ok(data!.some((r) => r.id === a.id));
  assert.ok(data!.some((r) => r.id === b.id));
});

// 7. Deleting a job_order_employees row leaves the member row present, with
//    job_order_employee_id NULL and its full_name/daily_rate SNAPSHOT
//    unchanged (ON DELETE SET NULL). This is the guarantee the whole member
//    table's duplicated columns exist for: a payroll that already printed
//    must never change because someone later deleted or edited the JO.
test("deleting a job_order_employees row preserves the member snapshot (ON DELETE SET NULL)", async () => {
  const area = await makeArea(`${TAG}-area-snapshot`);
  const jo = await makeJo(area.id, { full_name: `${TAG} Snapshot Person`, daily_rate: 555.5 });
  const payroll = await makePayroll({ description: `${TAG}-snapshot` });

  const member = await makeMember(payroll.id, {
    job_order_employee_id: jo.id,
    full_name: jo.full_name,
    daily_rate: jo.daily_rate,
    legacy_id: freshLegacyId(),
  });

  const del = await admin.from("job_order_employees").delete().eq("id", jo.id);
  assert.equal(del.error, null, `JO delete failed: ${del.error?.message}`);

  const { data, error } = await admin
    .from("job_order_payroll_members")
    .select("id, job_order_employee_id, full_name, daily_rate")
    .eq("id", member.id)
    .single();

  assert.equal(error, null, `member re-select failed: ${error?.message}`);
  assert.ok(data, "the member row must still exist after its JO is deleted");
  assert.equal(data!.job_order_employee_id, null, "job_order_employee_id must be nulled by ON DELETE SET NULL");
  assert.equal(data!.full_name, `${TAG} Snapshot Person`, "full_name snapshot must survive the JO's deletion unchanged");
  assert.equal(Number(data!.daily_rate), 555.5, "daily_rate snapshot must survive the JO's deletion unchanged");
});

// 8. Deleting a payroll cascades its members away (ON DELETE CASCADE).
test("deleting a payroll cascades its members away", async () => {
  const payroll = await makePayroll({ description: `${TAG}-cascade` });
  const member = await makeMember(payroll.id, {
    full_name: `${TAG} Cascade Victim`,
    legacy_id: freshLegacyId(),
  });

  const del = await admin.from("job_order_payrolls").delete().eq("id", payroll.id);
  assert.equal(del.error, null, `payroll delete failed: ${del.error?.message}`);

  const { data, error } = await admin
    .from("job_order_payroll_members")
    .select("id")
    .eq("id", member.id);
  assert.equal(error, null);
  assert.equal(data!.length, 0, "the member row must be gone once its parent payroll is deleted");
});

// 9. A soft-deleted JO is still resolvable by legacy_id — the path 5,893 of
//    11,015 legacy member rows depend on (see the JobOrderPayrollRoster doc
//    comment in job-order-payroll-import.ts). Nothing in this schema or its
//    RLS policies filters on deleted_at, but that invariant is exactly the
//    kind of thing a future "helpful" index or policy could silently break.
test("a soft-deleted job_order_employees row is still resolvable by legacy_id", async () => {
  const area = await makeArea(`${TAG}-area-softdel`);
  const legacyId = freshLegacyId();
  const jo = await makeJo(area.id, {
    full_name: `${TAG} Soft Deleted`,
    legacy_id: legacyId,
    deleted_at: new Date().toISOString(),
  });

  const { data, error } = await admin
    .from("job_order_employees")
    .select("id, full_name, deleted_at")
    .eq("legacy_id", legacyId)
    .maybeSingle();

  assert.equal(error, null, `select failed: ${error?.message}`);
  assert.ok(data, "a soft-deleted JO must still be found by legacy_id");
  assert.equal(data!.id, jo.id);
  assert.ok(data!.deleted_at, "deleted_at must remain set, not cleared by the lookup");
});

// 10. status CHECK rejects a value outside draft/finalized.
test("status CHECK rejects a value outside draft/finalized", async () => {
  const { error } = await admin
    .from("job_order_payrolls")
    .insert({
      description: `${TAG}-badstatus`,
      period_start: "2026-01-01",
      period_end: "2026-01-15",
      status: "archived",
    })
    .select()
    .single();

  assert.ok(error, "expected the status CHECK to reject an out-of-set value");
  assert.equal(error!.code, "23514");
});

// 11. The `areas` label re-syncs after a membership change. `areas` is
//     denormalized on job_order_payrolls AND is one of three columns the
//     list search matches (see the `.or(...)` in getJobOrderPayrolls), so
//     drift here is invisible until a search silently misses a payroll.
//     This calls the real recomputeAreas() from job-order-payroll-repo.ts —
//     load, derive and persist — so the whole path is under test, not a
//     reimplementation of it.
test("the areas label re-syncs after a membership change", async () => {
  const areaA = await makeArea(`${TAG}-area-Alpha`);
  const areaB = await makeArea(`${TAG}-area-Bravo`);
  const joA = await makeJo(areaA.id, { full_name: `${TAG} Alpha Person` });
  const joB = await makeJo(areaB.id, { full_name: `${TAG} Bravo Person` });
  const payroll = await makePayroll({ description: `${TAG}-areasresync` });

  await makeMember(payroll.id, {
    job_order_employee_id: joA.id,
    full_name: joA.full_name,
    area_name: areaA.name,
    legacy_id: freshLegacyId(),
  });

  async function persistedAreas() {
    const { data, error } = await admin
      .from("job_order_payrolls")
      .select("areas")
      .eq("id", payroll.id)
      .single();
    assert.equal(error, null, `areas read failed: ${error?.message}`);
    return data!.areas as string | null;
  }

  await recomputeAreas(adminRepo, payroll.id);
  assert.equal(await persistedAreas(), areaA.name);

  // Membership change: add a second member from a different area.
  await makeMember(payroll.id, {
    job_order_employee_id: joB.id,
    full_name: joB.full_name,
    area_name: areaB.name,
    legacy_id: freshLegacyId(),
  });

  await recomputeAreas(adminRepo, payroll.id);

  const { data: afterSecond } = await admin
    .from("job_order_payrolls")
    .select("areas")
    .eq("id", payroll.id)
    .single();
  assert.equal(
    afterSecond!.areas,
    [areaA.name, areaB.name].sort().join(", "),
    "the areas column must re-sync to reflect the new membership, not the stale one-member label",
  );
});

// 12. A forced chunk failure degrades gracefully. `upsertLegacyChunks` — the
//     real function importJobOrderPayrollCsv uses for both its payroll and
//     member writes — upserts in chunks, and on error pushes a batch-level
//     warning naming the chunk's legacy_id range and continues rather than
//     aborting. So one bad row can drop up to `chunkSize - 1` valid neighbours
//     behind a single warning line, but the REST of the import must still land.
//     Called here with chunkSize 2 so the input splits into exactly two
//     chunks: the first deliberately poisoned with a duplicate
//     (payroll_id, job_order_employee_id) pair violating
//     uq_job_order_payroll_members, the second clean.
test("a forced chunk failure degrades gracefully — the run reports it and continues", async () => {
  const area = await makeArea(`${TAG}-area-chunkfail`);
  const payroll = await makePayroll({ description: `${TAG}-chunkfail` });
  const jo = await makeJo(area.id, { full_name: `${TAG} Poisoned Employee` });
  const joGood1 = await makeJo(area.id, { full_name: `${TAG} Good One` });
  const joGood2 = await makeJo(area.id, { full_name: `${TAG} Good Two` });

  // Chunk 1: poisoned. Both rows target the SAME (payroll_id,
  // job_order_employee_id) pair via DIFFERENT legacy_ids, so
  // onConflict: "legacy_id" cannot deduplicate them and Postgres rejects the
  // whole statement on the plain UNIQUE (payroll_id, job_order_employee_id).
  const poisonedChunk = [
    {
      payroll_id: payroll.id,
      job_order_employee_id: jo.id,
      full_name: jo.full_name,
      legacy_id: freshLegacyId(),
    },
    {
      payroll_id: payroll.id,
      job_order_employee_id: jo.id,
      full_name: jo.full_name,
      legacy_id: freshLegacyId(),
    },
  ];

  // Chunk 2: clean, unaffected rows that must still land afterward.
  const cleanChunk = [
    {
      payroll_id: payroll.id,
      job_order_employee_id: joGood1.id,
      full_name: joGood1.full_name,
      legacy_id: freshLegacyId(),
    },
    {
      payroll_id: payroll.id,
      job_order_employee_id: joGood2.id,
      full_name: joGood2.full_name,
      legacy_id: freshLegacyId(),
    },
  ];

  // The real production function, chunked at 2 so the poisoned pair and the
  // clean pair land in separate chunks.
  const { returned, warnings } = await upsertLegacyChunks(
    adminRepo,
    "job_order_payroll_members",
    [...poisonedChunk, ...cleanChunk],
    { noun: "payroll member", select: "legacy_id", chunkSize: 2 },
  );

  assert.equal(warnings.length, 1, "exactly one chunk (the poisoned one) must have failed");
  assert.match(warnings[0]!, /Failed to save a batch of 2 payroll member/);
  assert.equal(
    returned.length,
    2,
    "the reported insert count must cover the clean chunk only, not the failed one",
  );

  const { data: poisonedRows } = await admin
    .from("job_order_payroll_members")
    .select("id")
    .in("legacy_id", poisonedChunk.map((r) => r.legacy_id));
  assert.equal(poisonedRows!.length, 0, "the poisoned chunk must land NO rows — Postgres aborts the whole statement");

  const { data: cleanRows } = await admin
    .from("job_order_payroll_members")
    .select("id, legacy_id")
    .in("legacy_id", cleanChunk.map((r) => r.legacy_id));
  assert.equal(
    cleanRows!.length,
    2,
    "the run must continue past the failed chunk and still save the good rows in the next one",
  );
});
