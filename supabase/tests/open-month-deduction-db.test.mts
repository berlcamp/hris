// Stack test for migrations 108 and 113: tardy/undertime is charged to VL only
// once the month is over and 7 more days have passed for corrections (Asia/Manila
// calendar) — November is charged on December 8.
//
//   * the open month posts nothing, whatever its minutes;
//   * postings already made for it are reversed (history kept) and the VL
//     balance follows;
//   * the month before it, closed, is charged — and by the daily cron once it
//     is the previous calendar month.
//
// Uses its own employee because the dates are relative to today and other
// suites write 2026 attendance for the seeded ones.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMP = "00000000-0000-0000-0000-0000000108e1";
const DEPT = "00000000-0000-0000-0000-0000000000d1";

// The earliest open month and the one before it, on the Manila calendar (UTC+8,
// no DST). A month is open until 7 days into the next one.
const graceEnd = new Date(Date.now() + 8 * 3600 * 1000 - 7 * 86400 * 1000);
const CUR = { year: graceEnd.getUTCFullYear(), month: graceEnd.getUTCMonth() + 1 };
const PREV = CUR.month === 1
  ? { year: CUR.year - 1, month: 12 }
  : { year: CUR.year, month: CUR.month - 1 };
// The cron charges the previous CALENDAR month, which during the grace days is
// still open.
const manilaNow = new Date(Date.now() + 8 * 3600 * 1000);
const IN_GRACE = manilaNow.getUTCMonth() !== graceEnd.getUTCMonth();

let VL = "";

async function cleanup() {
  await admin.from("external_undertime").delete().eq("employee_id", EMP);
  await admin.from("leave_credit_accruals").delete().eq("employee_id", EMP);
  await admin.from("leave_credits").delete().eq("employee_id", EMP);
  await admin.from("employees").delete().eq("id", EMP);
}

async function setExternal(ym: { year: number; month: number }, minutes: number) {
  const { error } = await admin.from("external_undertime").upsert(
    { employee_id: EMP, year: ym.year, month: ym.month, minutes, status: "apply", ext_id: "T108" },
    { onConflict: "employee_id,year,month" },
  );
  assert.equal(error, null);
}

async function apply(ym: { year: number; month: number }) {
  const { error } = await admin.rpc("apply_attendance_vl_deduction", {
    p_year: ym.year, p_month: ym.month, p_employee_id: EMP,
  });
  assert.equal(error, null);
}

async function posted(ym: { year: number; month: number }) {
  const { data, error } = await admin.from("leave_credit_accruals")
    .select("amount, notes")
    .eq("employee_id", EMP).eq("leave_type_id", VL)
    .eq("year", ym.year).eq("month", ym.month).eq("source", "attendance_deduction")
    .order("created_at");
  assert.equal(error, null);
  const rows = (data ?? []).map((r) => ({ amount: Number(r.amount), notes: r.notes as string }));
  return { rows, total: Number(rows.reduce((s, r) => s + r.amount, 0).toFixed(3)) };
}

async function vlTotal(year: number) {
  const { data } = await admin.from("leave_credits").select("total_credits")
    .eq("employee_id", EMP).eq("leave_type_id", VL).eq("year", year).maybeSingle();
  return data ? Number(data.total_credits) : null;
}

test.before(async () => {
  const { data } = await admin.from("leave_types").select("id").eq("code", "VL").single();
  VL = data!.id;
  await cleanup();
  const { error } = await admin.from("employees").insert({
    id: EMP, employee_no: "TEST-108", first_name: "Open", last_name: "Month",
    employment_type: "plantilla", department_id: DEPT, salary_grade: 11,
    step_increment: 1, hire_date: "2015-01-05", status: "active",
  });
  assert.equal(error, null);
});

test.after(cleanup);

test("a month stays open until the 8th of the next month (Manila)", async () => {
  const cases: [string, string][] = [
    ["2026-11-27T12:00:00+08:00", "2026-11-01"],
    ["2026-12-01T00:00:00+08:00", "2026-11-01"],
    ["2026-12-07T23:59:59+08:00", "2026-11-01"],
    ["2026-12-08T00:00:00+08:00", "2026-12-01"],
    // 16:00 UTC on Dec 7 is already Dec 8 in Manila.
    ["2026-12-07T16:00:00Z", "2026-12-01"],
    ["2027-01-07T12:00:00+08:00", "2026-12-01"],
    ["2027-01-08T12:00:00+08:00", "2027-01-01"],
  ];
  for (const [now, openFrom] of cases) {
    const { data, error } = await admin.rpc("attendance_deduction_open_from", { p_now: now });
    assert.equal(error, null);
    assert.equal(data, openFrom, now);
  }
});

test("the open month is not charged, however many minutes it has", async () => {
  await setExternal(CUR, 240);
  await apply(CUR);
  assert.deepEqual((await posted(CUR)).rows, []);

  const { data, error } = await admin.rpc("preview_attendance_vl_deduction", {
    p_year: CUR.year, p_month: CUR.month, p_employee_id: EMP,
  });
  assert.equal(error, null);
  assert.equal(data[0].total_minutes, 0);
  assert.equal(data[0].source, "open_month");
});

test("deductions already posted for the open month are reversed, VL follows", async () => {
  // What an import made before migration 108 left behind.
  const { error } = await admin.from("leave_credit_accruals").insert({
    employee_id: EMP, leave_type_id: VL, year: CUR.year, month: CUR.month,
    amount: -0.5, source: "attendance_deduction", notes: "pre-108 posting",
  });
  assert.equal(error, null);

  await apply(CUR);
  const p = await posted(CUR);
  assert.equal(p.total, 0);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].amount, 0.5);
  assert.match(p.rows[1].notes, /^Month not yet closed/);
  assert.equal(await vlTotal(CUR.year), 0);

  // Re-running is a no-op.
  await apply(CUR);
  assert.equal((await posted(CUR)).rows.length, 2);
});

test("the previous, closed month is charged", async () => {
  await setExternal(PREV, 240);
  await apply(PREV);
  const p = await posted(PREV);
  assert.equal(p.total, -0.5);
  assert.match(p.rows[0].notes, /^External DTR undertime deduction/);
});

test("the daily cron charges the month that just closed", { skip: IN_GRACE && "the previous calendar month is still in its grace days" }, async () => {
  await setExternal(PREV, 480);
  const { data, error } = await admin.rpc("cron_run_closed_month_vl_deduction");
  assert.equal(error, null);
  assert.match(String(data), new RegExp(`${PREV.year}-${String(PREV.month).padStart(2, "0")}`));
  assert.equal((await posted(PREV)).total, -1);
});
