// End-to-end tests for the Job Orders schema against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// The unit suite (job-order-helpers.test.mts) proves the pure mapping logic.
// This one proves the claims only a real database can answer:
//
//   * The chk_job_order_atm_account constraint actually rejects an account
//     number without an ATM — a CHECK constraint is only real if the database
//     enforces it.
//   * legacy_id upsert is idempotent, so re-running the import cannot double
//     the roster. This is the guarantee the whole migration strategy rests on.
//   * ON DELETE RESTRICT blocks removing an area that still has members.
//   * The normalized_name generated column matches normalizeAreaName(), not
//     just for the common case but for whitespace codepoints where Postgres
//     `\s` (locale-aware in en_US.UTF-8) and JavaScript `\s` disagree.
//   * A duplicate legacy_id inside one upsert batch is rejected rather than
//     silently dropping unrelated rows.
//   * The `Unassigned` seed guard in migration 056 is idempotent under
//     `npm run db:reset`.
//
// Credentials come from `supabase status -o json` and are never printed.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npx supabase start && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeAreaName } from "../../src/lib/job-order-helpers.ts";

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
// what ships in the browser bundle. Proves RLS (migration 060), not just app
// code: migration 020 grants SELECT on every hris table to `anon`, so without
// RLS enabled on job_order_areas / job_order_employees this client would read
// Job Order PII (names, SSS numbers, LandBank account numbers) straight from
// PostgREST regardless of what the Next.js server actions enforce.
const anon = createClient(status.API_URL, status.ANON_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const TAG = `jotest-${Date.now()}`;

// Monotonic per-run counter so every legacy_id minted in this file is unique,
// even across tests that both need a "fresh, definitely-not-taken" id.
let legacyIdSeq = 0;
function freshLegacyId() {
  legacyIdSeq += 1;
  return Number(`${Date.now()}`.slice(-9)) * 1000 + legacyIdSeq;
}

async function makeArea(name: string, isActive = true) {
  const { data, error } = await admin
    .from("job_order_areas")
    .insert({ name, is_active: isActive })
    .select("id, name, normalized_name, is_active")
    .single();
  assert.equal(error, null, `area insert failed: ${error?.message}`);
  return data!;
}

// Runs SQL directly against the local Postgres instance via the Supabase CLI
// (a devDependency already used for `supabase status`), bypassing PostgREST.
// Only ever used against `--local` — never point this at a remote project.
function runSqlLocal(sql: string) {
  execFileSync("npx", ["supabase", "db", "query", "--local", sql], {
    cwd: PROJECT_DIR,
    stdio: "pipe",
  });
}

test.after(async () => {
  // Employees first — ON DELETE RESTRICT would block the areas otherwise.
  await admin.from("job_order_employees").delete().like("full_name", `${TAG}%`);
  await admin.from("job_order_areas").delete().like("name", `${TAG}%`);
});

test("the Unassigned area is seeded by migration 056", async () => {
  const { data } = await admin
    .from("job_order_areas")
    .select("id, name")
    .eq("normalized_name", "unassigned")
    .maybeSingle();

  assert.ok(data, "expected a seeded 'Unassigned' area");
});

test("normalized_name generated column matches normalizeAreaName()", async () => {
  const raw = `${TAG}  Mayor's   Office `;
  const area = await makeArea(raw);
  assert.equal(area.normalized_name, normalizeAreaName(raw));
});

// Postgres `\s` is locale-aware in en_US.UTF-8 and matches NBSP / EM SPACE /
// IDEOGRAPHIC SPACE / U+0085 (NEL) as whitespace, but NOT U+FEFF (BOM).
// JavaScript's `\s` is the mirror image on U+0085 and U+FEFF. This nearly
// shipped as a duplicate-area bug: two legacy rows differing only in which
// "space" character they used would collapse to the same normalized_name in
// the DB but to two different strings in the importer's own normalization,
// so the importer would create a second area instead of matching the
// existing one. Compare against what the DB actually computed — no
// hardcoded expected strings — so this is a live differential test, not a
// restatement of the implementation.
test("normalized_name matches normalizeAreaName() across whitespace codepoints Postgres and JS disagree on", async () => {
  const codepoints = [
    { label: "NEL (U+0085)", cp: 0x85 },
    { label: "NBSP (U+00A0)", cp: 0xa0 },
    { label: "EM SPACE (U+2003)", cp: 0x2003 },
    { label: "IDEOGRAPHIC SPACE (U+3000)", cp: 0x3000 },
    { label: "BOM (U+FEFF)", cp: 0xfeff },
  ];

  for (const { label, cp } of codepoints) {
    const char = String.fromCodePoint(cp);
    const raw = `${TAG} cp${cp} a${char}b`;
    const area = await makeArea(raw);
    assert.equal(
      area.normalized_name,
      normalizeAreaName(raw),
      `${label}: DB's normalized_name diverged from normalizeAreaName()`,
    );
  }
});

test("duplicate area names are rejected", async () => {
  const name = `${TAG}-dup`;
  await makeArea(name);
  const { error } = await admin
    .from("job_order_areas")
    .insert({ name })
    .select()
    .single();

  assert.ok(error, "expected a unique violation");
  assert.equal(error!.code, "23505");
});

test("soft-deleting an area frees its name for reuse", async () => {
  const name = `${TAG}-reuse`;
  const first = await makeArea(name);
  await admin
    .from("job_order_areas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", first.id);

  const { error } = await admin
    .from("job_order_areas")
    .insert({ name })
    .select()
    .single();

  assert.equal(error, null, "partial unique index should allow reuse");
});

test("account number without an ATM violates chk_job_order_atm_account", async () => {
  const area = await makeArea(`${TAG}-atm`);
  const { error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} No Atm`,
      area_id: area.id,
      has_atm: false,
      landbank_account_number: "1234567890",
    })
    .select()
    .single();

  assert.ok(error, "expected the CHECK constraint to reject this row");
  assert.equal(error!.code, "23514");
});

test("account number with an ATM is accepted", async () => {
  const area = await makeArea(`${TAG}-atm-ok`);
  const { error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} Has Atm`,
      area_id: area.id,
      has_atm: true,
      landbank_account_number: "1234567890",
    })
    .select()
    .single();

  assert.equal(error, null, `unexpected rejection: ${error?.message}`);
});

test("upsert on legacy_id is idempotent — re-import does not duplicate", async () => {
  const area = await makeArea(`${TAG}-idem`);
  const legacyId = freshLegacyId();
  const row = {
    legacy_id: legacyId,
    full_name: `${TAG} Juan Cruz`,
    area_id: area.id,
    daily_rate: 400,
  };

  const first = await admin
    .from("job_order_employees")
    .upsert(row, { onConflict: "legacy_id", ignoreDuplicates: false });
  assert.equal(first.error, null, `first upsert failed: ${first.error?.message}`);

  const second = await admin
    .from("job_order_employees")
    .upsert(
      { ...row, daily_rate: 450 },
      { onConflict: "legacy_id", ignoreDuplicates: false },
    );
  assert.equal(second.error, null, `second upsert failed: ${second.error?.message}`);

  const { data } = await admin
    .from("job_order_employees")
    .select("id, daily_rate")
    .eq("legacy_id", legacyId);

  assert.equal(data!.length, 1, "re-import must not duplicate the roster");
  assert.equal(Number(data![0].daily_rate), 450, "re-import must update in place");
});

// Documents WHY job-order-csv-import-actions.ts de-duplicates legacy_id
// in-process before calling .upsert(): without that guard, one legacy id
// that appears twice in a 200-row export chunk does not just affect those
// two rows — Postgres rejects the ENTIRE upsert statement, which would drop
// up to 199 unrelated people from that chunk.
test("a duplicate legacy_id within one upsert batch is rejected by Postgres", async () => {
  const area = await makeArea(`${TAG}-batch`);
  const legacyId = freshLegacyId();
  const rows = [
    { legacy_id: legacyId, full_name: `${TAG} Batch One`, area_id: area.id },
    { legacy_id: legacyId, full_name: `${TAG} Batch Two`, area_id: area.id },
  ];

  const { error } = await admin
    .from("job_order_employees")
    .upsert(rows, { onConflict: "legacy_id", ignoreDuplicates: false });

  assert.ok(error, "expected Postgres to reject a duplicated legacy_id within one upsert batch");
  assert.equal(error!.code, "21000");

  const { data } = await admin
    .from("job_order_employees")
    .select("id")
    .eq("legacy_id", legacyId);
  assert.equal(data!.length, 0, "a rejected batch must leave no partial rows behind");
});

test("an area with members cannot be hard-deleted", async () => {
  const area = await makeArea(`${TAG}-restrict`);
  await admin
    .from("job_order_employees")
    .insert({ full_name: `${TAG} Member`, area_id: area.id });

  const { error } = await admin
    .from("job_order_areas")
    .delete()
    .eq("id", area.id);

  assert.ok(error, "expected ON DELETE RESTRICT to block this");
  assert.equal(error!.code, "23503");
});

test("legacy deleted_at survives insert as a soft delete", async () => {
  const area = await makeArea(`${TAG}-softdel`);
  const when = "2024-03-01T00:00:00.000Z";
  const { data, error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} Departed`,
      area_id: area.id,
      deleted_at: when,
    })
    .select("deleted_at")
    .single();

  assert.equal(error, null);
  assert.equal(new Date(data!.deleted_at!).toISOString(), when);
});

// `npm run db:reset` re-applies every migration from scratch, so migration
// 056's guarded seed INSERT already ran at least once by the time this test
// executes. Re-running the exact same guard here (verbatim from the
// migration) proves a second run cannot duplicate the seeded row — this
// does NOT delete or modify the existing 'Unassigned' area.
test("the Unassigned seed guard is idempotent — re-running it does not duplicate the row", async () => {
  const seedSql = `
    INSERT INTO hris.job_order_areas (name, description)
    SELECT 'Unassigned', 'Placeholder for migrated records with no area in the legacy system.'
    WHERE NOT EXISTS (
      SELECT 1 FROM hris.job_order_areas WHERE normalized_name = 'unassigned'
    );
  `;

  runSqlLocal(seedSql);
  runSqlLocal(seedSql);

  const { data, error } = await admin
    .from("job_order_areas")
    .select("id")
    .eq("normalized_name", "unassigned");

  assert.equal(error, null, `select failed: ${error?.message}`);
  assert.equal(
    data!.length,
    1,
    "exactly one Unassigned area must exist after re-running the seed guard",
  );
});

// Migration 056 created job_order_areas / job_order_employees without
// enabling RLS. Migration 020 grants broad default privileges on new hris
// tables to `authenticated` (ALL) and `anon` (SELECT), so with no RLS above
// those grants, the anon key — which ships in the browser bundle — could read
// every Job Order person's PII directly via PostgREST. Migration 060 enables
// RLS and restricts both tables to super_admin / hr_admin / jo_manager. This
// test proves the anon client is now blocked while the admin (service-role)
// client, which every server action actually uses, still works.
test("anon key cannot read job_order_employees; RLS restricts it to admin roles (migration 060)", async () => {
  const area = await makeArea(`${TAG}-rls`);
  const legacyId = freshLegacyId();

  const inserted = await admin
    .from("job_order_employees")
    .insert({
      legacy_id: legacyId,
      full_name: `${TAG} RLS Probe`,
      area_id: area.id,
      sss_no: "01-2345678-9",
      landbank_account_number: null,
    })
    .select("id")
    .single();
  assert.equal(inserted.error, null, `admin insert failed: ${inserted.error?.message}`);

  const anonRead = await anon
    .from("job_order_employees")
    .select("id, full_name, sss_no")
    .eq("id", inserted.data!.id);

  assert.equal(anonRead.error, null, `anon select should not error, just return nothing: ${anonRead.error?.message}`);
  assert.equal(
    anonRead.data!.length,
    0,
    "anon (unauthenticated) client must see zero rows once RLS is enabled",
  );

  const adminRead = await admin
    .from("job_order_employees")
    .select("id, full_name")
    .eq("id", inserted.data!.id);

  assert.equal(adminRead.error, null, `admin select failed: ${adminRead.error?.message}`);
  assert.equal(
    adminRead.data!.length,
    1,
    "admin (service-role) client bypasses RLS and must still see the row",
  );
});

test("anon key cannot read job_order_areas; RLS restricts it to admin roles (migration 060)", async () => {
  const area = await makeArea(`${TAG}-rls-areas`);

  const anonRead = await anon
    .from("job_order_areas")
    .select("id, name")
    .eq("id", area.id);

  assert.equal(anonRead.error, null, `anon select should not error, just return nothing: ${anonRead.error?.message}`);
  assert.equal(
    anonRead.data!.length,
    0,
    "anon (unauthenticated) client must see zero rows once RLS is enabled",
  );

  const adminRead = await admin
    .from("job_order_areas")
    .select("id, name")
    .eq("id", area.id);

  assert.equal(adminRead.error, null, `admin select failed: ${adminRead.error?.message}`);
  assert.equal(adminRead.data!.length, 1, "admin (service-role) client bypasses RLS and must still see the row");
});

// The importer upserts in chunks of 200. Postgres aborts the WHOLE statement
// when one row is bad, so a single unparseable cell used to cost up to 199
// innocent people — a real import lost 377 of 577 that way. The importer now
// retries a failed chunk row by row. These two tests pin both halves of that
// claim: that a batch really does fail wholesale, and that per-row retry
// isolates only the offender.
test("one bad row aborts an entire batch upsert", async () => {
  const area = await makeArea(`${TAG}-batchfail`);
  // Every row must carry the SAME keys: PostgREST builds a multi-row insert
  // from the union of keys, so a row omitting has_atm would be sent an
  // explicit NULL and fail 23502 (not-null) before the CHECK could fire.
  // The importer is safe here — it builds every row from one object literal
  // with all 30 columns always set.
  const base = (n: number, extra: Record<string, unknown> = {}) => ({
    full_name: `${TAG} batch ${n}`,
    area_id: area.id,
    legacy_id: Number(String(Date.now()).slice(-8) + String(n)),
    has_atm: false,
    landbank_account_number: null as string | null,
    ...extra,
  });

  // The middle row violates chk_job_order_atm_account (account without an ATM).
  const rows = [
    base(1),
    base(2, { landbank_account_number: "1234567890" }),
    base(3),
  ];

  const { error } = await admin
    .from("job_order_employees")
    .upsert(rows, { onConflict: "legacy_id", ignoreDuplicates: false });

  assert.ok(error, "expected the batch to be rejected");
  assert.equal(error!.code, "23514", "expected the CHECK constraint violation");

  const { data } = await admin
    .from("job_order_employees")
    .select("legacy_id")
    .in("legacy_id", rows.map((r) => r.legacy_id));

  assert.equal(
    data!.length,
    0,
    "the two GOOD rows must also be absent — this is the wholesale-abort behaviour the retry exists to work around",
  );
});

test("per-row retry saves the good rows and isolates the bad one", async () => {
  const area = await makeArea(`${TAG}-rowretry`);
  const base = (n: number, extra: Record<string, unknown> = {}) => ({
    full_name: `${TAG} retry ${n}`,
    area_id: area.id,
    legacy_id: Number(String(Date.now()).slice(-8) + String(n)),
    has_atm: false,
    landbank_account_number: null as string | null,
    ...extra,
  });
  const rows = [
    base(4),
    base(5, { landbank_account_number: "1234567890" }),
    base(6),
  ];

  // Mirrors the importer's fallback path.
  const failures: number[] = [];
  for (const row of rows) {
    const { error } = await admin
      .from("job_order_employees")
      .upsert(row, { onConflict: "legacy_id", ignoreDuplicates: false });
    if (error) failures.push(row.legacy_id);
  }

  assert.deepEqual(failures, [rows[1].legacy_id], "only the constraint-violating row should fail");

  const { data } = await admin
    .from("job_order_employees")
    .select("legacy_id")
    .in("legacy_id", rows.map((r) => r.legacy_id));

  assert.equal(data!.length, 2, "both good rows must have landed despite their neighbour failing");
});
