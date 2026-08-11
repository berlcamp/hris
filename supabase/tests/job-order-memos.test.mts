// End-to-end tests for the Job Order MEMORANDUM schema
// (`hris.job_order_memos` / `hris.job_order_memo_members`, migration 078)
// against the LOCAL Supabase stack (real Postgres + real PostgREST).
//
// job-order-memo-render.test.mts already proves the printable and the zod
// schema with zero database dependency. This file proves the claims only a
// real database can answer — the tier that, on the sibling Job Orders roster
// (migrations 056/059/060), caught a `42P10` upsert failure and a missing-RLS
// PII leak that earlier gates missed:
//
//   * RLS actually blocks the anon key — the key that ships in the browser
//     bundle — from both tables.
//   * `addJobOrderMemoMembers`'s upsert with
//     onConflict "memo_id,job_order_employee_id" is inferable by PostgREST
//     (no 42P10) and is insert-or-skip, so re-adding somebody already listed
//     is a no-op rather than a duplicate row.
//   * The memo_type CHECK is enforced by Postgres, not just by zod.
//   * ON DELETE SET NULL on job_order_employee_id preserves the frozen
//     snapshot when a JO is deleted — the whole reason the member table
//     duplicates the printed columns instead of joining live.
//   * ON DELETE CASCADE removes a memo's members with it.
//   * The real `loadMemoMembers` / `loadJobOrdersForMemo` from
//     src/lib/job-order-memo-repo.ts return what the actions assume: numeric
//     rates as NUMBERS (PostgREST serializes numeric as a string), the area
//     flattened to `area_name`, and inactive/soft-deleted JOs excluded.
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
  loadJobOrdersForMemo,
  loadMemoMembers,
  toMemoMemberSnapshot,
  type MemoDbClient,
} from "../../src/lib/job-order-memo-repo.ts";

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

// Unauthenticated client using only the public anon key — exactly what ships
// in the browser bundle. Migration 020 grants SELECT on every new hris table
// to `anon`, so without the RLS migration 078 enables, this client would read
// every JO's name and daily rate straight from PostgREST no matter what the
// server actions enforce.
const anon = createClient(status.API_URL, status.ANON_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// The repo functions are typed against `ReturnType<typeof createAdminClient>`.
// This handle is the same createClient call with the same service-role key,
// differing only in defaulting db.schema to hris — the repo calls
// `.schema("hris")` explicitly anyway, so the two are interchangeable at
// runtime. Cast once here rather than at every call site.
const adminRepo = admin as unknown as MemoDbClient;

const TAG = `jomemotest-${Date.now()}`;
let seq = 0;

async function makeArea(name = `${TAG} area ${++seq}`) {
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
      full_name: `${TAG} JO ${++seq}`,
      area_id: areaId,
      daily_rate: 480,
      ...overrides,
    })
    .select("id, full_name, daily_rate")
    .single();
  assert.equal(error, null, `job_order_employees insert failed: ${error?.message}`);
  return data!;
}

async function makeMemo(overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("job_order_memos")
    .insert({
      memo_no: `${TAG}-${++seq}`,
      memo_type: "new",
      subject: "JOB ORDER CONTRACTS",
      memo_date: "2026-07-22",
      period_covered: "July 24-31, 2026",
      ...overrides,
    })
    .select("id, memo_no, memo_type, subject, memo_date, period_covered")
    .single();
  assert.equal(error, null, `job_order_memos insert failed: ${error?.message}`);
  return data!;
}

test("RLS: the browser's anon key cannot read memos or their members", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id);
  const memo = await makeMemo();
  const { error: insErr } = await admin
    .from("job_order_memo_members")
    .insert({ memo_id: memo.id, ...toMemoMemberSnapshot({ id: jo.id, full_name: jo.full_name, area_name: area.name, daily_rate: 480 }) });
  assert.equal(insErr, null, `member insert failed: ${insErr?.message}`);

  const { data: memos } = await anon.from("job_order_memos").select("id");
  assert.deepEqual(memos ?? [], [], "anon read job_order_memos");

  const { data: members } = await anon
    .from("job_order_memo_members")
    .select("id, full_name, daily_rate");
  assert.deepEqual(members ?? [], [], "anon read job_order_memo_members");
});

test("memo_type is constrained by Postgres, not only by zod", async () => {
  const { error } = await admin
    .from("job_order_memos")
    .insert({
      memo_no: `${TAG}-bad`,
      memo_type: "extension",
      subject: "S",
      memo_date: "2026-07-22",
    });
  assert.notEqual(error, null, "an unknown memo_type was accepted");
});

test("adding members is insert-or-skip on (memo_id, job_order_employee_id)", async () => {
  const area = await makeArea();
  const [a, b] = [await makeJo(area.id), await makeJo(area.id)];
  const memo = await makeMemo();

  const roster = await loadJobOrdersForMemo(adminRepo, { ids: [a.id, b.id] });
  assert.equal(roster.length, 2);

  const rows = roster.map((jo) => ({ memo_id: memo.id, ...toMemoMemberSnapshot(jo) }));

  // The exact call addJobOrderMemoMembers makes. A partial unique index here
  // would fail with 42P10 — the defect migration 059 had to fix — so this
  // asserts the plain UNIQUE constraint migration 078 used is inferable.
  const first = await admin
    .from("job_order_memo_members")
    .upsert(rows, {
      onConflict: "memo_id,job_order_employee_id",
      ignoreDuplicates: true,
    });
  assert.equal(first.error, null, `first upsert failed: ${first.error?.message}`);

  const second = await admin
    .from("job_order_memo_members")
    .upsert(rows, {
      onConflict: "memo_id,job_order_employee_id",
      ignoreDuplicates: true,
    });
  assert.equal(second.error, null, `re-add failed: ${second.error?.message}`);

  const members = await loadMemoMembers(adminRepo, memo.id);
  assert.equal(members.length, 2, "re-adding duplicated the roster");
});

test("loadMemoMembers returns numeric rates as numbers, ordered by name", async () => {
  const area = await makeArea();
  const memo = await makeMemo();
  const zed = await makeJo(area.id, { full_name: `${TAG} ZZZ`, daily_rate: 500 });
  const abe = await makeJo(area.id, { full_name: `${TAG} AAA`, daily_rate: 480 });

  const roster = await loadJobOrdersForMemo(adminRepo, { ids: [zed.id, abe.id] });
  await admin
    .from("job_order_memo_members")
    .insert(roster.map((jo) => ({ memo_id: memo.id, ...toMemoMemberSnapshot(jo) })));

  const members = await loadMemoMembers(adminRepo, memo.id);
  assert.equal(members.length, 2);
  assert.equal(members[0]!.full_name, `${TAG} AAA`);
  assert.equal(members[1]!.full_name, `${TAG} ZZZ`);
  // PostgREST serializes numeric(10,2) as a STRING; the repo must convert, or
  // every rate would print as text and sort like text.
  assert.equal(typeof members[0]!.daily_rate, "number");
  assert.equal(members[0]!.daily_rate, 480);
  assert.equal(members[0]!.office_assignment, area.name);
});

test("deleting a Job Order preserves the memo's frozen snapshot", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id, { daily_rate: 480 });
  const memo = await makeMemo();

  const roster = await loadJobOrdersForMemo(adminRepo, { ids: [jo.id] });
  await admin
    .from("job_order_memo_members")
    .insert(roster.map((r) => ({ memo_id: memo.id, ...toMemoMemberSnapshot(r) })));

  const { error: delErr } = await admin
    .from("job_order_employees")
    .delete()
    .eq("id", jo.id);
  assert.equal(delErr, null, `JO delete failed: ${delErr?.message}`);

  const members = await loadMemoMembers(adminRepo, memo.id);
  assert.equal(members.length, 1, "the member row was destroyed with the JO");
  assert.equal(members[0]!.job_order_employee_id, null);
  assert.equal(members[0]!.full_name, jo.full_name);
  assert.equal(members[0]!.daily_rate, 480);
  assert.equal(members[0]!.office_assignment, area.name);
});

test("deleting a memo cascades to its members", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id);
  const memo = await makeMemo();
  const roster = await loadJobOrdersForMemo(adminRepo, { ids: [jo.id] });
  await admin
    .from("job_order_memo_members")
    .insert(roster.map((r) => ({ memo_id: memo.id, ...toMemoMemberSnapshot(r) })));

  await admin.from("job_order_memos").delete().eq("id", memo.id);

  const { data } = await admin
    .from("job_order_memo_members")
    .select("id")
    .eq("memo_id", memo.id);
  assert.deepEqual(data ?? [], []);
});

test("the picker offers only active, non-deleted Job Orders", async () => {
  const area = await makeArea();
  const active = await makeJo(area.id);
  const inactive = await makeJo(area.id, { status: "inactive" });
  const softDeleted = await makeJo(area.id, {
    deleted_at: new Date().toISOString(),
  });

  const roster = await loadJobOrdersForMemo(adminRepo, {
    ids: [active.id, inactive.id, softDeleted.id],
  });
  assert.deepEqual(
    roster.map((r) => r.id),
    [active.id],
  );
});
