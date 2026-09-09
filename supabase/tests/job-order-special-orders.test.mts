// End-to-end tests for the Job Order SPECIAL ORDER schema
// (`hris.job_order_special_orders` / `hris.job_order_special_order_members`,
// migration 089) against the LOCAL Supabase stack (real Postgres + real
// PostgREST).
//
// job-order-special-order-render.test.mts already proves the printable and the
// zod schema with zero database dependency. This file proves the claims only a
// real database can answer — the same tier that, on the sibling memorandum
// tables (migration 078) and the Job Orders roster (056/059/060), caught a
// `42P10` upsert failure and a missing-RLS PII leak that earlier gates missed:
//
//   * RLS actually blocks the anon key — the key that ships in the browser
//     bundle — from both tables.
//   * `addJobOrderSpecialOrderMembers`'s upsert with
//     onConflict "special_order_id,job_order_employee_id" is inferable by
//     PostgREST (no 42P10) and is insert-or-skip, so re-adding somebody
//     already listed is a no-op rather than a duplicate row.
//   * ON DELETE SET NULL on job_order_employee_id preserves the frozen
//     snapshot when a JO is deleted — the whole reason the member table
//     duplicates the printed columns instead of joining live.
//   * ON DELETE CASCADE removes an order's members with it.
//   * The real `loadSpecialOrderMembers` / `loadJobOrdersForSpecialOrder` from
//     src/lib/job-order-special-order-repo.ts return what the actions assume:
//     the area flattened to `area_name`, members ordered by name, and
//     inactive/soft-deleted JOs excluded.
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
  loadJobOrdersForSpecialOrder,
  loadSpecialOrderMembers,
  toSpecialOrderMemberSnapshot,
  type SpecialOrderDbClient,
} from "../../src/lib/job-order-special-order-repo.ts";

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
// to `anon`, so without the RLS migration 089 enables, this client would read
// every JO's name and area assignment straight from PostgREST no matter what
// the server actions enforce.
const anon = createClient(status.API_URL, status.ANON_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// The repo functions are typed against `ReturnType<typeof createAdminClient>`.
// This handle is the same createClient call with the same service-role key,
// differing only in defaulting db.schema to hris — the repo calls
// `.schema("hris")` explicitly anyway, so the two are interchangeable at
// runtime. Cast once here rather than at every call site.
const adminRepo = admin as unknown as SpecialOrderDbClient;

const TAG = `josotest-${Date.now()}`;
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
    .select("id, full_name")
    .single();
  assert.equal(error, null, `job_order_employees insert failed: ${error?.message}`);
  return data!;
}

async function makeSpecialOrder(overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("job_order_special_orders")
    .insert({
      so_no: `${TAG}-${++seq}`,
      subject: "RENDITION OF ADDITIONAL TIME SERVICES",
      so_date: "2025-05-29",
      period_covered: "JUNE 2025",
      ...overrides,
    })
    .select("id, so_no, subject, so_date, period_covered")
    .single();
  assert.equal(
    error,
    null,
    `job_order_special_orders insert failed: ${error?.message}`,
  );
  return data!;
}

test("RLS: the browser's anon key cannot read special orders or their members", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id);
  const so = await makeSpecialOrder();
  const { error: insErr } = await admin
    .from("job_order_special_order_members")
    .insert({
      special_order_id: so.id,
      ...toSpecialOrderMemberSnapshot({
        id: jo.id,
        full_name: jo.full_name,
        area_name: area.name,
      }),
    });
  assert.equal(insErr, null, `member insert failed: ${insErr?.message}`);

  const { data: orders } = await anon
    .from("job_order_special_orders")
    .select("id");
  assert.deepEqual(orders ?? [], [], "anon read job_order_special_orders");

  const { data: members } = await anon
    .from("job_order_special_order_members")
    .select("id, full_name, area_assigned");
  assert.deepEqual(
    members ?? [],
    [],
    "anon read job_order_special_order_members",
  );
});

test("subject and date are NOT NULL in Postgres, not only in zod", async () => {
  const noSubject = await admin
    .from("job_order_special_orders")
    .insert({ so_no: `${TAG}-nosubject`, so_date: "2025-05-29" });
  assert.notEqual(noSubject.error, null, "a subject-less order was accepted");

  const noDate = await admin
    .from("job_order_special_orders")
    .insert({ so_no: `${TAG}-nodate`, subject: "S" });
  assert.notEqual(noDate.error, null, "a date-less order was accepted");
});

test("adding members is insert-or-skip on (special_order_id, job_order_employee_id)", async () => {
  const area = await makeArea();
  const [a, b] = [await makeJo(area.id), await makeJo(area.id)];
  const so = await makeSpecialOrder();

  const roster = await loadJobOrdersForSpecialOrder(adminRepo, {
    ids: [a.id, b.id],
  });
  assert.equal(roster.length, 2);

  const rows = roster.map((jo) => ({
    special_order_id: so.id,
    ...toSpecialOrderMemberSnapshot(jo),
  }));

  // The exact call addJobOrderSpecialOrderMembers makes. A partial unique
  // index here would fail with 42P10 — the defect migration 059 had to fix —
  // so this asserts the plain UNIQUE constraint migration 089 used is
  // inferable.
  const first = await admin
    .from("job_order_special_order_members")
    .upsert(rows, {
      onConflict: "special_order_id,job_order_employee_id",
      ignoreDuplicates: true,
    });
  assert.equal(first.error, null, `first upsert failed: ${first.error?.message}`);

  const second = await admin
    .from("job_order_special_order_members")
    .upsert(rows, {
      onConflict: "special_order_id,job_order_employee_id",
      ignoreDuplicates: true,
    });
  assert.equal(second.error, null, `re-add failed: ${second.error?.message}`);

  const members = await loadSpecialOrderMembers(adminRepo, so.id);
  assert.equal(members.length, 2, "re-adding duplicated the roster");
});

test("loadSpecialOrderMembers orders by name and flattens the area", async () => {
  const area = await makeArea();
  const so = await makeSpecialOrder();
  const zed = await makeJo(area.id, { full_name: `${TAG} ZZZ` });
  const abe = await makeJo(area.id, { full_name: `${TAG} AAA` });

  const roster = await loadJobOrdersForSpecialOrder(adminRepo, {
    ids: [zed.id, abe.id],
  });
  await admin.from("job_order_special_order_members").insert(
    roster.map((jo) => ({
      special_order_id: so.id,
      ...toSpecialOrderMemberSnapshot(jo),
    })),
  );

  const members = await loadSpecialOrderMembers(adminRepo, so.id);
  assert.equal(members.length, 2);
  assert.equal(members[0]!.full_name, `${TAG} AAA`);
  assert.equal(members[1]!.full_name, `${TAG} ZZZ`);
  assert.equal(members[0]!.area_assigned, area.name);
});

test("deleting a Job Order preserves the special order's frozen snapshot", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id);
  const so = await makeSpecialOrder();

  const roster = await loadJobOrdersForSpecialOrder(adminRepo, { ids: [jo.id] });
  await admin.from("job_order_special_order_members").insert(
    roster.map((r) => ({
      special_order_id: so.id,
      ...toSpecialOrderMemberSnapshot(r),
    })),
  );

  const { error: delErr } = await admin
    .from("job_order_employees")
    .delete()
    .eq("id", jo.id);
  assert.equal(delErr, null, `JO delete failed: ${delErr?.message}`);

  const members = await loadSpecialOrderMembers(adminRepo, so.id);
  assert.equal(members.length, 1, "the member row was destroyed with the JO");
  assert.equal(members[0]!.job_order_employee_id, null);
  assert.equal(members[0]!.full_name, jo.full_name);
  assert.equal(members[0]!.area_assigned, area.name);
});

test("deleting a special order cascades to its members", async () => {
  const area = await makeArea();
  const jo = await makeJo(area.id);
  const so = await makeSpecialOrder();
  const roster = await loadJobOrdersForSpecialOrder(adminRepo, { ids: [jo.id] });
  await admin.from("job_order_special_order_members").insert(
    roster.map((r) => ({
      special_order_id: so.id,
      ...toSpecialOrderMemberSnapshot(r),
    })),
  );

  await admin.from("job_order_special_orders").delete().eq("id", so.id);

  const { data } = await admin
    .from("job_order_special_order_members")
    .select("id")
    .eq("special_order_id", so.id);
  assert.deepEqual(data ?? [], []);
});

test("the picker offers only active, non-deleted Job Orders", async () => {
  const area = await makeArea();
  const active = await makeJo(area.id);
  const inactive = await makeJo(area.id, { status: "inactive" });
  const softDeleted = await makeJo(area.id, {
    deleted_at: new Date().toISOString(),
  });

  const roster = await loadJobOrdersForSpecialOrder(adminRepo, {
    ids: [active.id, inactive.id, softDeleted.id],
  });
  assert.deepEqual(
    roster.map((r) => r.id),
    [active.id],
  );
});
