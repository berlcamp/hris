"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  isDeptScoped,
  isAttendanceManager,
  canPrintDtr,
} from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  dayLateUndertime,
  dutyDateFor,
  unrecordedDayCharge,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
// The DTR page builder and the time/rule helpers it shares with the biometric
// importer live in a plain module: a "use server" file may only export async
// functions, and an exported builder that skips authorization would be a
// network-reachable endpoint. See the note at the top of dtr-builder.ts.
import {
  DTR_EMPLOYEE_SELECT,
  applyRestDayRule,
  applyUndertimeAbsenceRule,
  buildDtrResults,
  employeesWithAttendance,
  extractTime,
  loadDtrEmployeesForDepartment,
  resolveDefaultSchedule,
  timestampOnNextDay,
  type BulkDtrResult,
  type DtrEmployeeRow,
  type DtrSignatoryDeptRow,
} from "@/lib/dtr-builder";
import {
  recomputeAttendanceDeductionFor,
  recomputeAttendanceDeductionsBatch,
} from "@/lib/actions/attendance-deduction-actions";
import type { DahuaParsedRow } from "@/lib/dahua-parse";
import {
  resortDaysForPunches,
  storePunches,
  type PoolPunchInput,
  type ResortSeed,
} from "@/lib/punch-pool";
import { getHolidayMap } from "@/lib/holiday-helpers";
import { holidayExcusedSessions } from "@/lib/validations/holiday-schema";

// --- Types ---

export interface AttendanceLogRow {
  id: string;
  employee_id: string;
  date: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  is_late: boolean;
  late_minutes: number;
  is_undertime: boolean;
  undertime_minutes: number;
  is_absent: boolean;
  remarks: string | null;
  source: string;
  created_at: string;
  created_by_email: string | null;
  updated_by_email: string | null;
  updated_at: string | null;
  // Per-day schedule override (migration 047). NULL means the entry inherits the
  // employee's assigned schedule. `schedules` is the joined override, if any.
  schedule_id: string | null;
  schedules: { name: string } | null;
  employees: {
    first_name: string;
    last_name: string;
    departments: { name: string; code: string } | null;
  } | null;
}

// The DTR page shapes now live with the builder that produces them. Re-exported
// here so existing importers (the PDF components) keep working — `export type`
// is erased at compile time, so it does not violate the "use server" rule that
// every runtime export be an async function.
export type {
  BulkDtrEmployee,
  BulkDtrResult,
  DtrEntry,
  DtrScheduleInfo,
  DtrSummary,
} from "@/lib/dtr-builder";

export interface ImportPreviewRow extends DahuaParsedRow {
  hasConflict: boolean;
  /** The existing row was authored by a person (manual entry, hand-edit or
   *  approved correction), so no import will overwrite it — even with
   *  "overwrite existing" ON. */
  isProtected: boolean;
  conflictDetails: string | null;
}

// The biometric importer's bucketing and day-record building moved to
// @/lib/punch-pool, which re-sorts days from the raw punch pool. The DTR's
// time/rule helpers live in @/lib/dtr-builder. Only one copy of each rule.

// --- Data Fetching ---

export async function getAttendanceLogs(filters?: {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "*, schedules!attendance_logs_schedule_id_fkey(name), employees!attendance_logs_employee_id_fkey(first_name, last_name, departments!employees_department_id_fkey(name, code))"
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters?.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }

  // Role-based filtering
  if (user.role === "employee") {
    // employees can only see their own attendance
    const { data: empData } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("user_profile_id", user.id)
      .maybeSingle();
    if (empData) {
      query = query.eq("employee_id", empData.id);
    } else {
      return [];
    }
  } else if (isDeptScoped(user.role) && user.departmentId) {
    const { data: deptEmployees } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    if (deptEmployees && deptEmployees.length > 0) {
      query = query.in("employee_id", deptEmployees.map((e) => e.id));
    } else {
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  // Normalize TIMESTAMPTZ columns to HH:MM strings for display
  return (data ?? []).map((row) => ({
    ...row,
    time_in_am: extractTime(row.time_in_am as string | null),
    time_out_am: extractTime(row.time_out_am as string | null),
    time_in_pm: extractTime(row.time_in_pm as string | null),
    time_out_pm: extractTime(row.time_out_pm as string | null),
  })) as AttendanceLogRow[];
}


// --- Delete a single attendance entry ---

export async function deleteAttendanceEntry(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    return { error: "Unauthorized" };
  }

  const supabase = createAdminClient();

  // Read the row first so we can refresh the right employee/month afterwards.
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, employee_id, date")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { error: "Entry not found" };

  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  // Keep the VL ledger in sync with the removed day.
  const [y, m] = (existing.date as string).split("-").map(Number);
  await recomputeAttendanceDeductionFor(existing.employee_id as string, y, m);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "attendance_logs",
    recordId: id,
    oldValues: { employee_id: existing.employee_id, date: existing.date },
  });

  revalidatePath("/attendance");
  return { success: true };
}


// --- Match parsed rows to employees and check conflicts ---
// Dahua exports are parsed in the browser (see src/lib/dahua-parse.ts) so the
// multi-MB raw file never crosses the Server Action 1MB body limit; only the
// compact parsed rows reach the actions below.

export async function matchAndPreviewImport(
  parsedRows: DahuaParsedRow[]
): Promise<ImportPreviewRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Get all employee IDs (and their schedule) mapped by biometric_no
  const uniqueNos = [...new Set(parsedRows.map((r) => r.employeeNo))];
  const numericNos = uniqueNos.map(Number).filter((n) => !isNaN(n));
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, biometric_no, schedules(id, time_in, time_out, break_start, break_end)",
    )
    .in("biometric_no", numericNos);

  const empRows = (employees ?? []) as unknown as {
    id: string;
    biometric_no: number;
    schedules: ScheduleLike | null;
  }[];

  const empMap = new Map(empRows.map((e) => [String(e.biometric_no), e.id]));
  const defaultSched = await resolveDefaultSchedule(supabase);
  const schedByEmp = new Map<string, ScheduleLike>(
    empRows.map((e) => [e.id, e.schedules ?? defaultSched]),
  );

  // Compute duty dates per parsed row using each employee's schedule so the
  // preview reports conflicts against the bucket the importer will actually
  // write to (matters for night shifts).
  const previewWithDuty = parsedRows.map((row) => {
    const employeeId = empMap.get(row.employeeNo) ?? null;
    const sched = employeeId
      ? schedByEmp.get(employeeId) ?? defaultSched
      : defaultSched;
    const duty = employeeId ? dutyDateFor(row.date, row.time, sched) : row.date;
    return { row, employeeId, duty };
  });

  const dutyDates = [
    ...new Set(previewWithDuty.map((p) => p.duty)),
  ];
  const employeeIds = [...new Set(empRows.map((e) => e.id))];

  let existingLogs: {
    employee_id: string;
    date: string;
    source: string | null;
    correction_locked: boolean | null;
  }[] = [];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data } = await supabase
      .schema("hris")
      .from("attendance_logs")
      // source and correction_locked drive the preview's wording: the import
      // will refuse to overwrite a human-authored day even with "overwrite
      // existing" ON, so the preview must not promise an update it will not
      // perform.
      .select("employee_id, date, source, correction_locked")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    existingLogs = data ?? [];
  }

  const existingSet = new Set(
    existingLogs.map((l) => `${l.employee_id}_${l.date}`),
  );
  // Days no import will touch, whatever the overwrite setting. Mirrors the
  // skip rule in importDahuaAttendance — keep the two in step.
  const protectedSet = new Set(
    existingLogs
      .filter((l) => (l.source !== null && l.source !== "biometric") || l.correction_locked)
      .map((l) => `${l.employee_id}_${l.date}`),
  );

  return previewWithDuty.map(({ row, employeeId, duty }) => {
    const matched = employeeId !== null;
    const key = `${employeeId}_${duty}`;
    const hasConflict = matched && existingSet.has(key);
    const isProtected = matched && protectedSet.has(key);

    return {
      ...row,
      matched,
      employeeId,
      hasConflict,
      isProtected,
      conflictDetails: isProtected
        ? "Entered by hand — will be kept, not overwritten"
        : hasConflict
        ? "Merged with the punches already on file for this day"
        : !matched
        ? "Employee not found in system"
        : null,
    };
  });
}

// --- Import Dahua attendance data ---
//
// An import adds the file's punches to the raw punch pool (hris.attendance_punches,
// migration 091) and then re-sorts every employee-day it touched from ALL of the
// employee's pooled punches — every device, every import. A day that began at
// Building 1 and ended at Building 3 comes out whole, whichever file is imported
// first. The pool and the re-sort live in @/lib/punch-pool, shared with replay.

// The batch's own copy of the parsed rows: what replay re-reads to find the days
// a batch covers. Mirrors the rows the browser sends to the importer.
interface StoredPunch {
  employeeNo: string;
  employeeName: string;
  date: string;
  time: string;
  status: string;
}

// Resolves employee numbers to employee ids by biometric_no ON THE SERVER. The
// preview's matched / employeeId flags came back from the browser; they are for
// display only and must not decide whose day a punch lands on.
async function matchEmployeeNos(
  supabase: ReturnType<typeof createAdminClient>,
  employeeNos: string[],
): Promise<Map<string, string>> {
  const numeric = [...new Set(employeeNos)]
    .map(Number)
    .filter((n) => Number.isInteger(n));
  const byNo = new Map<string, string>();
  const CHUNK = 500;
  for (let i = 0; i < numeric.length; i += CHUNK) {
    const { data, error } = await supabase
      .schema("hris")
      .from("employees")
      .select("id, biometric_no")
      .in("biometric_no", numeric.slice(i, i + CHUNK));
    if (error) throw error;
    for (const e of data ?? []) byNo.set(String(e.biometric_no), e.id as string);
  }
  return byNo;
}

function toPoolInput(
  rows: StoredPunch[],
  byNo: Map<string, string>,
): PoolPunchInput[] {
  return rows.map((r) => ({
    employeeNo: r.employeeNo,
    employeeName: r.employeeName,
    employeeId: byNo.get(r.employeeNo) ?? null,
    date: r.date,
    time: r.time,
    status: r.status,
  }));
}

function toSeeds(rows: PoolPunchInput[]): ResortSeed[] {
  return rows
    .filter((r): r is PoolPunchInput & { employeeId: string } => !!r.employeeId)
    .map((r) => ({ employeeId: r.employeeId, date: r.date, time: r.time }));
}

// The longest description the batch list can show without the layout fighting
// it. Enforced here rather than in the DB so an over-long label is a message
// the importer can act on, not a constraint violation.
const IMPORT_DESCRIPTION_MAX = 120;

/**
 * Normalizes and validates the description an import must carry.
 *
 * Checked on the server as well as in the dialog because the dialog is not the
 * only possible caller of a server action. Failing here fails before a single
 * punch or attendance row is written.
 */
function normalizeImportDescription(raw: string): string {
  const description = raw.trim().replace(/\s+/g, " ");
  if (!description) {
    throw new Error("Add a short description so this import can be found later.");
  }
  if (description.length > IMPORT_DESCRIPTION_MAX) {
    throw new Error(
      `Description must be ${IMPORT_DESCRIPTION_MAX} characters or fewer.`,
    );
  }
  return description;
}

export async function importDahuaAttendance(
  previewRows: DahuaParsedRow[],
  /** The device the file was exported from (hris.biometric_devices). */
  deviceId: string,
  /** Required label for the saved batch — how this import is found for replay. */
  description: string,
): Promise<{
  /** Employee-days written to attendance_logs. */
  imported: number;
  protectedSkipped: number;
  errors: number;
  totalPunches: number;
  /** Punches the pool did not already have. */
  newPunches: number;
  /** Punches already in the pool — the same file, or an overlapping export. */
  duplicatePunches: number;
  unmatchedPunches: number;
  dayRecords: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }

  // Before any write: a rejected description or device must not leave punches
  // behind with no batch to replay them from.
  const batchDescription = normalizeImportDescription(description);

  const supabase = createAdminClient();

  const { data: device } = await supabase
    .schema("hris")
    .from("biometric_devices")
    .select("id, name, is_active")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device || !device.is_active) {
    throw new Error("Choose the device this file was exported from.");
  }

  const stored: StoredPunch[] = previewRows.map((r) => ({
    employeeNo: r.employeeNo,
    employeeName: r.employeeName,
    date: r.date,
    time: r.time,
    status: r.status,
  }));
  const byNo = await matchEmployeeNos(
    supabase,
    stored.map((p) => p.employeeNo),
  );
  const poolRows = toPoolInput(stored, byNo);

  // The batch is written FIRST: every pooled punch points at it. Unlike the
  // old best-effort save, a batch that cannot be recorded stops the import.
  const dates = stored.map((p) => p.date).filter(Boolean).sort();
  const { data: batch, error: batchErr } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .insert({
      imported_by: user.id,
      description: batchDescription,
      device_id: deviceId,
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
      punch_count: stored.length,
      punches: stored,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    throw new Error(batchErr?.message ?? "Could not save the import batch.");
  }

  const pool = await storePunches(supabase, poolRows, {
    deviceId,
    batchId: batch.id as string,
  });
  const res = await resortDaysForPunches(supabase, toSeeds(poolRows));

  // Refresh VL ledger for every (employee, month) the import touched.
  if (res.touched.length > 0) {
    await recomputeAttendanceDeductionsBatch(res.touched);
  }

  const unmatchedPunches = poolRows.filter((r) => !r.employeeId).length;
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import_attendance",
    tableName: "attendance_logs",
    recordId: batch.id as string,
    newValues: {
      description: batchDescription,
      device: device.name,
      imported: res.written,
      protectedSkipped: res.protectedSkipped,
      errors: res.errors + pool.invalid,
      newPunches: pool.inserted,
      duplicatePunches: pool.duplicates,
      totalRows: previewRows.length,
    },
  });

  revalidatePath("/attendance");
  return {
    imported: res.written,
    /** Days left alone because a person authored them (manual entry, hand-edit
     *  or approved correction). Their punches are still in the pool. */
    protectedSkipped: res.protectedSkipped,
    errors: res.errors + pool.invalid,
    totalPunches: previewRows.length,
    newPunches: pool.inserted,
    duplicatePunches: pool.duplicates,
    unmatchedPunches,
    dayRecords: res.dayRecords,
  };
}
// --- Import batches: list + replay ---

export interface ImportBatchRow {
  id: string;
  /** The label supplied at import time — how a manager picks a batch to replay. */
  description: string;
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  punch_count: number;
  imported_by_name: string | null;
}

// Lists saved import batches, newest first, for the "Past Imports" list.
export async function getImportBatches(): Promise<ImportBatchRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select(
      "id, description, imported_at, period_start, period_end, punch_count, user_profiles(full_name, email)",
    )
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const prof = r.user_profiles as unknown as {
      full_name: string | null;
      email: string | null;
    } | null;
    return {
      id: r.id as string,
      // Batches written before migration 074 were backfilled, so this is only
      // ever empty for a row inserted around the migration itself.
      description: (r.description as string | null) ?? "",
      imported_at: r.imported_at as string,
      period_start: r.period_start as string | null,
      period_end: r.period_end as string | null,
      punch_count: r.punch_count as number,
      imported_by_name: prof?.full_name ?? prof?.email ?? null,
    };
  });
}

// Loads a batch's saved rows and re-matches them to employees by biometric_no.
// Shared by preview + run.
async function loadBatchForReplay(
  supabase: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<{
  poolRows: PoolPunchInput[];
  deviceId: string | null;
  unmatchedPunches: number;
}> {
  const { data: batch, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select("punches, device_id")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) throw new Error("Import not found");

  const stored = (batch.punches ?? []) as StoredPunch[];
  const byNo = await matchEmployeeNos(
    supabase,
    stored.map((p) => p.employeeNo),
  );
  const poolRows = toPoolInput(stored, byNo);
  return {
    poolRows,
    deviceId: (batch.device_id as string | null) ?? null,
    unmatchedPunches: poolRows.filter((r) => !r.employeeId).length,
  };
}

export interface ReplayPreview {
  daysToRebucket: number;
  daysToSkip: number;
  unmatchedPunches: number;
}

// Dry run: how many days a replay would re-sort vs. skip (because the day is
// no longer a plain biometric row — a manager corrected it since). No writes.
export async function previewImportReplay(
  batchId: string,
): Promise<ReplayPreview> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { poolRows, unmatchedPunches } = await loadBatchForReplay(
    supabase,
    batchId,
  );
  const res = await resortDaysForPunches(supabase, toSeeds(poolRows), {
    dryRun: true,
  });
  return {
    daysToRebucket: res.written,
    daysToSkip: res.protectedSkipped,
    unmatchedPunches,
  };
}

// Re-sorts the days a saved import covers with the current logic, from the
// whole punch pool — so punches other devices contributed to those days are
// kept, not wiped. Overwrites only days whose attendance_logs row is still
// source = 'biometric' (or absent); any day a manager edited is left untouched.
export async function runImportReplay(batchId: string): Promise<{
  reBucketed: number;
  skipped: number;
  unmatchedPunches: number;
  errors: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();

  // Punches pooled before their employee's biometric number was set.
  await supabase.schema("hris").rpc("rematch_attendance_punches");

  const { poolRows, deviceId, unmatchedPunches } = await loadBatchForReplay(
    supabase,
    batchId,
  );
  // Idempotent: puts back any of this batch's punches the pool is missing.
  const pool = await storePunches(supabase, poolRows, { deviceId, batchId });
  const res = await resortDaysForPunches(supabase, toSeeds(poolRows));

  if (res.touched.length > 0) {
    await recomputeAttendanceDeductionsBatch(res.touched);
  }

  const errors = res.errors + pool.invalid;
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "replay_attendance_import",
    tableName: "attendance_logs",
    recordId: batchId,
    newValues: {
      reBucketed: res.written,
      skipped: res.protectedSkipped,
      unmatchedPunches,
      errors,
    },
  });

  revalidatePath("/attendance");
  return {
    reBucketed: res.written,
    skipped: res.protectedSkipped,
    unmatchedPunches,
    errors,
  };
}
// --- Bulk DTR (department + date range) ---
//
// The ~200-line day loop these two functions used to each carry a copy of now
// lives in buildDtrResults (@/lib/dtr-builder). What is left here is the part
// that differs and must not be shared: who is allowed to ask.

export async function getDepartmentDtrBulk(
  departmentId: string,
  startDate: string,
  endDate: string,
): Promise<{ department: { id: string; name: string } | null; results: BulkDtrResult[] }> {
  const user = await getCurrentUser();
  // Bulk export covers a whole department, so it is limited to the roles that
  // print DTRs across departments (mirrors the /attendance/dtr/bulk gate).
  if (!user || !canPrintDtr(user.roles)) throw new Error("Unauthorized");

  if (!startDate || !endDate) {
    throw new Error("Date range required");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  const { data: department } = await supabase
    .schema("hris")
    .from("departments")
    .select("id, name, code")
    .eq("id", departmentId)
    .maybeSingle();

  const employeeRowsAll = await loadDtrEmployeesForDepartment(
    supabase,
    departmentId,
  );

  // Restrict to employees who actually have attendance_logs in the range —
  // "inclusion" is implicit by the presence of records.
  const withLogs = await employeesWithAttendance(
    supabase,
    employeeRowsAll.map((e) => e.id),
    startDate,
    endDate,
  );
  const employeeRows = employeeRowsAll.filter((e) => withLogs.has(e.id));

  const results = await buildDtrResults(
    supabase,
    employeeRows,
    startDate,
    endDate,
    (department as DtrSignatoryDeptRow | null) ?? null,
  );

  return { department: department ?? null, results };
}

// --- Individual DTR over an arbitrary date range ---

export async function getEmployeeDtrRange(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<BulkDtrResult | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (!startDate || !endDate) {
    throw new Error("Date range required");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  const { data: employee } = await supabase
    .schema("hris")
    .from("employees")
    .select(DTR_EMPLOYEE_SELECT)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return null;
  const emp = employee as unknown as DtrEmployeeRow;

  // Employees may only fetch their own DTR.
  if (user.role === "employee" && emp.user_profile_id !== user.id) {
    throw new Error("Unauthorized");
  }

  // Dept-scoped users (non-composite) may only fetch DTRs for employees in
  // their own department.
  if (
    isDeptScoped(user.role) &&
    user.role !== "department_admin_and_department_head" &&
    user.departmentId &&
    emp.department_id !== user.departmentId
  ) {
    throw new Error("Unauthorized");
  }

  // No signatory override: an individual export is not tied to a department
  // being printed, so the employee's own home department stands.
  const [result] = await buildDtrResults(
    supabase,
    [emp],
    startDate,
    endDate,
    null,
  );
  return result ?? null;
}


// --- Attendance Report (per-employee totals, scoped by dept + date range) ---

export interface AttendanceReportRow {
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  schedule_name: string;
  days_present: number;
  days_absent: number;
  days_on_leave: number;
  late_count: number;
  late_minutes: number;
  undertime_count: number;
  undertime_minutes: number;
  total_deficit_minutes: number;
  leave_credit_days: number; // 3-decimal days, 0.125/hr
}

export async function getAttendanceReport(
  departmentId: string | null,
  startDate: string,
  endDate: string,
): Promise<AttendanceReportRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.roles)) {
    throw new Error("Unauthorized");
  }
  if (!startDate || !endDate) throw new Error("Date range required");
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const supabase = createAdminClient();

  let empQuery = supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, departments!employees_department_id_fkey(name), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (departmentId) empQuery = empQuery.eq("department_id", departmentId);

  const { data: employees } = await empQuery;
  const empRows = (employees ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    departments: { name: string } | null;
    schedules: (ScheduleLike & { name: string }) | null;
  }[];

  if (empRows.length === 0) return [];

  const empIds = empRows.map((e) => e.id);

  // The holiday calendar is part of scoring a day, not decoration: a session a
  // declared holiday (or a no_*_deductions waiver) covers is not charged on the
  // DTR, so it must not be charged here either — this report is a summary of
  // those very DTRs.
  const holidayMap = await getHolidayMap(supabase, startDate, endDate);

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      // All four punches and their reasons, not just the outer pair: since the
      // half-day rule a session missing either of its punches is charged, so
      // this report cannot judge a day from its arrival and departure alone —
      // it would read every lunch pair as missing and charge everybody.
      .select(
        "employee_id, date, time_in_am, time_out_am, time_in_pm, time_out_pm, time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason, no_time_reason, is_absent",
      )
      .in("employee_id", empIds)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select("employee_id, start_date, end_date, leave_dates")
      .in("employee_id", empIds)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  const logsByEmp = new Map<string, Map<string, Record<string, unknown>>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    const id = log.employee_id as string;
    if (!logsByEmp.has(id)) logsByEmp.set(id, new Map());
    logsByEmp.get(id)!.set(log.date as string, log);
  }

  const leavesByEmp = new Map<string, Set<string>>();
  for (const leave of (leaves ?? []) as {
    employee_id: string;
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
  }[]) {
    if (!leavesByEmp.has(leave.employee_id)) leavesByEmp.set(leave.employee_id, new Set());
    const set = leavesByEmp.get(leave.employee_id)!;
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) set.add(d);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          set.add(key);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  // Build the working calendar between startDate and endDate
  const calendar: { date: string; isWeekend: boolean }[] = [];
  {
    const d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      calendar.push({ date: dateStr, isWeekend: dow === 0 || dow === 6 });
      d.setDate(d.getDate() + 1);
    }
  }

  // Inclusion is implicit: only employees with attendance logs in the range
  // appear in the report.
  const defaultSched = await resolveDefaultSchedule(supabase);
  return empRows
    .filter((e) => (logsByEmp.get(e.id)?.size ?? 0) > 0)
    .map((emp) => {
    const sched = emp.schedules ?? defaultSched;
    const logMap = logsByEmp.get(emp.id) ?? new Map();
    const leaveSet = leavesByEmp.get(emp.id) ?? new Set<string>();

    let daysPresent = 0;
    let daysAbsent = 0;
    let daysOnLeave = 0;
    let lateCount = 0;
    let lateMinutes = 0;
    let undertimeCount = 0;
    let undertimeMinutes = 0;

    for (const day of calendar) {
      const log = logMap.get(day.date) as Record<string, unknown> | undefined;
      const holidayType = holidayMap.get(day.date)?.type ?? null;
      const hasPunch =
        !!log &&
        !!(
          log.time_in_am ||
          log.time_out_am ||
          log.time_in_pm ||
          log.time_out_pm
        );
      // Same order as the DTR: a full holiday nobody worked, with no stated
      // reason, prints HOLIDAY — neither present nor absent, whether or not a
      // blank row exists for it.
      if (holidayType === "full" && !hasPunch && !log?.no_time_reason) {
        continue;
      }
      if (log) {
        const isAbsent = (log.is_absent as boolean) ?? false;
        // A weekend owes no hours, so a blank row there is a rest day, not an
        // absence — the same rule the DTR applies, and the same one the no-row
        // branch below already applied to this very date.
        if (day.isWeekend && isAbsent) {
          // counted as neither present nor absent
        } else if (isAbsent) {
          daysAbsent++;
        } else {
          const tIn = log.time_in_am as string | null;
          const tOutAm = log.time_out_am as string | null;
          const tInPm = log.time_in_pm as string | null;
          const tOut = log.time_out_pm as string | null;
          const holidayExcuses = holidayExcusedSessions(holidayType);
          // The same one function the DTR scores a day with — this report used
          // to re-derive late/undertime from the two primitives, which is
          // exactly how a report and the document it summarises drift apart.
          const { lateMinutes: lmRaw, undertimeMinutes: umRaw } =
            dayLateUndertime(
              day.date,
              sched,
              {
                time_in_am: extractTime(tIn),
                time_out_am: extractTime(tOutAm),
                time_in_pm: extractTime(tInPm),
                time_out_pm: extractTime(tOut),
                time_in_am_next_day: timestampOnNextDay(tIn, day.date),
                time_in_pm_next_day: timestampOnNextDay(tInPm, day.date),
                time_out_pm_next_day: timestampOnNextDay(tOut, day.date),
              },
              {
                reasons: {
                  in_am: !!log.time_in_am_reason,
                  out_am: !!log.time_out_am_reason,
                  in_pm: !!log.time_in_pm_reason,
                  out_pm: !!log.time_out_pm_reason,
                },
                excuseAm: holidayExcuses.am || !!log.no_time_reason,
                excusePm: holidayExcuses.pm || !!log.no_time_reason,
              },
            );
          // Same DTR rule: undertime caps at 7h; 8h+ counts the day absent —
          // and a weekend, owing no hours, is never reclassified absent.
          const { lateMins: lm, undertimeMins: um, absent } = day.isWeekend
            ? applyRestDayRule(lmRaw, umRaw)
            : applyUndertimeAbsenceRule(lmRaw, umRaw, false);
          if (absent) {
            daysAbsent++;
          } else {
            daysPresent++;
            if (lm > 0) {
              lateCount++;
              lateMinutes += lm;
            }
            if (um > 0) {
              undertimeCount++;
              undertimeMinutes += um;
            }
          }
        }
      } else if (!day.isWeekend && leaveSet.has(day.date)) {
        daysOnLeave++;
      } else {
        // No row: the DTR's own rule — a weekday is absent, a half-day holiday
        // owes its other half as 4 hours of undertime, a weekend owes nothing.
        const { absent, undertimeMinutes: um } = unrecordedDayCharge(
          day.date,
          holidayType === "half_am" || holidayType === "half_pm",
        );
        if (absent) {
          daysAbsent++;
        } else if (um > 0) {
          undertimeCount++;
          undertimeMinutes += um;
        }
      }
    }

    const total = lateMinutes + undertimeMinutes;
    return {
      employee_id: emp.id,
      employee_name: [emp.last_name, emp.first_name].filter(Boolean).join(", "),
      department_name: emp.departments?.name ?? null,
      schedule_name: emp.schedules?.name ?? "Default 8:00–17:00",
      days_present: daysPresent,
      days_absent: daysAbsent,
      days_on_leave: daysOnLeave,
      late_count: lateCount,
      late_minutes: lateMinutes,
      undertime_count: undertimeCount,
      undertime_minutes: undertimeMinutes,
      total_deficit_minutes: total,
      leave_credit_days: Number((total / 480).toFixed(3)),
    };
  });
}
