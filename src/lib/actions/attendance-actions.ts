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
  bucketPunchesForDuty,
  dayLateUndertime,
  dutyDateFor,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
// The DTR page builder and the time/rule helpers it shares with the biometric
// importer live in a plain module: a "use server" file may only export async
// functions, and an exported builder that skips authorization would be a
// network-reachable endpoint. See the note at the top of dtr-builder.ts.
import {
  DTR_EMPLOYEE_SELECT,
  applyUndertimeAbsenceRule,
  buildDtrResults,
  employeesWithAttendance,
  extractTime,
  loadDtrEmployeesForDepartment,
  loadOverrideSchedules,
  resolveDefaultSchedule,
  timestampOnNextDay,
  type BulkDtrResult,
  type DtrEmployeeRow,
  type DtrSignatoryDeptRow,
} from "@/lib/dtr-builder";
// buildAttendanceRecord is no longer reached from here: manual entry was the
// only caller and now lives in the corrections module, which goes through
// buildCorrectionRecord. The biometric importer still needs the flag maths.
import { computeAttendanceFlags } from "@/lib/attendance-record";
import {
  recomputeAttendanceDeductionFor,
  recomputeAttendanceDeductionsBatch,
} from "@/lib/actions/attendance-deduction-actions";
import type { DahuaParsedRow } from "@/lib/dahua-parse";
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

// --- Helpers ---

function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert a date string and HH:MM time string to an ISO timestamp string for TIMESTAMPTZ columns */
function toTimestamp(date: string, time: string | null): string | null {
  if (!time) return null;
  return `${date}T${time}:00`;
}

// extractTime, timestampOnNextDay, resolveDefaultSchedule, loadOverrideSchedules,
// applyUndertimeAbsenceRule and UNDERTIME_ABSENT_MINUTES moved to
// @/lib/dtr-builder, which the biometric importer below imports them back from.
// They are shared with the DTR builder and only one copy may define the rules.

/**
 * Dahua face devices fire the same event 2–3 times within seconds (e.g. one
 * "Check In" recorded at 07:54:34/37/40). After parse truncates each to HH:MM
 * these become identical punches that overflow the AM/PM slots in
 * bucketPunchesForDuty, pushing the real Break-Out / Check-Out into the wrong
 * column. Collapse a run of punches that share the same minute, or share the
 * same device status and land within 2 minutes of each other (the burst),
 * keeping the earliest — so each real event survives exactly once. Punches far
 * apart in time are never merged, even with the same status.
 */
function dedupePunches(
  punches: { date: string; time: string; status: string }[],
): { date: string; time: string; status: string }[] {
  const normStatus = (s: string) => s.replace(/[\s_-]+/g, "").toLowerCase();
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const sorted = [...punches].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
  const out: { date: string; time: string; status: string }[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.date === p.date) {
      const sameMinute = p.time === prev.time;
      const sameStatusBurst =
        !!p.status &&
        normStatus(p.status) === normStatus(prev.status) &&
        Math.abs(toMin(p.time) - toMin(prev.time)) <= 2;
      if (sameMinute || sameStatusBurst) continue;
    }
    out.push(p);
  }
  return out;
}

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
  if (!user || !isAttendanceManager(user.role)) {
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
  if (!user || !isAttendanceManager(user.role)) {
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
        ? "Existing record will be updated"
        : !matched
        ? "Employee not found in system"
        : null,
    };
  });
}

// --- Import Dahua attendance data ---

// Compact raw punch persisted per import batch so an import can be re-bucketed
// later ("replay") without the original Dahua file. Mirrors the parsed rows the
// browser sends to the importer.
interface StoredPunch {
  employeeNo: string;
  employeeName: string;
  date: string;
  time: string;
  status: string;
}

// Shared core for the Dahua importer AND import replay: groups matched punches
// by employee + duty date, honors any per-day override schedule already pinned
// to that day, buckets each group into AM/PM slots, and builds the
// attendance_logs upsert row. Keeping this in ONE place is what lets replay
// re-apply a bucketing fix identically to a fresh import. Returns each record's
// `${employeeId}_${dutyDate}` key (parallel to `records`) and the source of any
// existing row per key, so callers can decide what to overwrite vs. skip.
async function buildBiometricRecords(
  supabase: ReturnType<typeof createAdminClient>,
  matchedPunches: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[],
  schedByEmp: Map<string, ScheduleLike>,
  defaultSched: ScheduleLike,
): Promise<{
  records: Record<string, unknown>[];
  keys: string[];
  existingSourceByKey: Map<string, string>;
  /** Keys whose existing row came from an APPROVED attendance correction. */
  correctionLockedKeys: Set<string>;
  touched: { employeeId: string; year: number; month: number }[];
  errors: number;
}> {
  interface Group {
    employeeId: string;
    dutyDate: string;
    sched: ScheduleLike;
    punches: { date: string; time: string; status: string }[];
  }
  const grouped = new Map<string, Group>();
  for (const p of matchedPunches) {
    const sched = schedByEmp.get(p.employeeId) ?? defaultSched;
    const dutyDate = dutyDateFor(p.date, p.time, sched);
    const key = `${p.employeeId}_${dutyDate}`;
    if (!grouped.has(key)) {
      grouped.set(key, { employeeId: p.employeeId, dutyDate, sched, punches: [] });
    }
    grouped.get(key)!.punches.push({ date: p.date, time: p.time, status: p.status });
  }

  // Honor per-day schedule overrides pinned by a DTR manager, and capture each
  // existing row's source so replay can skip days a human has since corrected.
  const overrideSchedByKey = new Map<string, ScheduleLike>();
  const existingSourceByKey = new Map<string, string>();
  const correctionLockedKeys = new Set<string>();
  const employeeIds = [...new Set([...grouped.values()].map((g) => g.employeeId))];
  const dutyDates = [...new Set([...grouped.values()].map((g) => g.dutyDate))];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data: existing } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date, schedule_id, source, correction_locked")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    const existingRows = (existing ?? []) as {
      employee_id: string;
      date: string;
      schedule_id: string | null;
      source: string | null;
      correction_locked: boolean | null;
    }[];
    const schedById = await loadOverrideSchedules(supabase, existingRows);
    for (const r of existingRows) {
      const key = `${r.employee_id}_${r.date}`;
      existingSourceByKey.set(key, r.source ?? "");
      if (r.correction_locked) correctionLockedKeys.add(key);
      if (r.schedule_id) {
        const sched = schedById.get(r.schedule_id);
        if (sched) overrideSchedByKey.set(key, sched);
      }
    }
  }

  const records: Record<string, unknown>[] = [];
  const keys: string[] = [];
  const touched: { employeeId: string; year: number; month: number }[] = [];
  let errors = 0;
  for (const [key, group] of grouped) {
    try {
      // A pinned override schedule for this day wins over the employee's
      // assigned one (for break-window bucketing and late/undertime).
      const overrideSched = overrideSchedByKey.get(key) ?? null;
      const effSched = overrideSched ?? group.sched;

      const bucket = bucketPunchesForDuty(
        dedupePunches(group.punches),
        group.dutyDate,
        effSched,
      );

      const flags = computeAttendanceFlags(
        {
          time_in_am: bucket.time_in_am,
          time_out_am: bucket.time_out_am,
          time_in_pm: bucket.time_in_pm,
          time_out_pm: bucket.time_out_pm,
          time_in_am_next_day: bucket.time_in_am_next_day,
          time_in_pm_next_day: bucket.time_in_pm_next_day,
          time_out_pm_next_day: bucket.time_out_pm_next_day,
        },
        group.dutyDate,
        effSched,
      );

      const nextDate = addDaysIso(group.dutyDate, 1);
      const dateOf = (onNext: boolean) => (onNext ? nextDate : group.dutyDate);

      records.push({
        employee_id: group.employeeId,
        date: group.dutyDate,
        schedule_id: overrideSched?.id ?? null,
        time_in_am: toTimestamp(dateOf(bucket.time_in_am_next_day), bucket.time_in_am),
        time_out_am: toTimestamp(dateOf(bucket.time_out_am_next_day), bucket.time_out_am),
        time_in_pm: toTimestamp(dateOf(bucket.time_in_pm_next_day), bucket.time_in_pm),
        time_out_pm: toTimestamp(dateOf(bucket.time_out_pm_next_day), bucket.time_out_pm),
        ...flags,
        source: "biometric",
        remarks: null,
      });
      keys.push(key);

      const [yr, mo] = group.dutyDate.split("-").map(Number);
      touched.push({ employeeId: group.employeeId, year: yr, month: mo });
    } catch {
      errors++;
    }
  }
  return {
    records,
    keys,
    existingSourceByKey,
    correctionLockedKeys,
    touched,
    errors,
  };
}

// Persist the raw parsed punches for this import so it can be replayed later.
// Stores ALL rows (even unmatched) so a replay can re-match employees added
// after the fact. Best-effort: a failed save must not fail the import itself.
async function saveImportBatch(
  supabase: ReturnType<typeof createAdminClient>,
  importedBy: string,
  previewRows: ImportPreviewRow[],
): Promise<void> {
  if (previewRows.length === 0) return;
  const punches: StoredPunch[] = previewRows.map((r) => ({
    employeeNo: r.employeeNo,
    employeeName: r.employeeName,
    date: r.date,
    time: r.time,
    status: r.status,
  }));
  const dates = punches.map((p) => p.date).filter(Boolean).sort();
  try {
    await supabase
      .schema("hris")
      .from("attendance_import_batches")
      .insert({
        imported_by: importedBy,
        period_start: dates[0] ?? null,
        period_end: dates[dates.length - 1] ?? null,
        punch_count: punches.length,
        punches,
      });
  } catch {
    // swallow — the attendance rows are already written; replay is a convenience
  }
}

export async function importDahuaAttendance(
  previewRows: ImportPreviewRow[],
  overwriteExisting: boolean
): Promise<{
  imported: number;
  skipped: number;
  protectedSkipped: number;
  errors: number;
  totalPunches: number;
  unmatchedPunches: number;
  dayRecords: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Fetch each matched employee's schedule once so bucketing matches the
  // preview's duty-date calculation.
  const employeeIds = [
    ...new Set(
      previewRows
        .filter((r) => r.matched && r.employeeId)
        .map((r) => r.employeeId as string),
    ),
  ];

  const defaultSched = await resolveDefaultSchedule(supabase);
  const schedByEmp = new Map<string, ScheduleLike>();
  if (employeeIds.length > 0) {
    const { data: emps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id, schedules(id, time_in, time_out, break_start, break_end)")
      .in("id", employeeIds);
    for (const e of (emps ?? []) as unknown as {
      id: string;
      schedules: ScheduleLike | null;
    }[]) {
      schedByEmp.set(e.id, e.schedules ?? defaultSched);
    }
  }

  // Pre-filter conflicts (skipped when not overwriting) and collect the matched
  // punches; the shared builder handles grouping, override schedules, bucketing
  // and flag computation — identical to replay.
  const skipKeys = new Set<string>();
  const matched: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[] = [];
  for (const row of previewRows) {
    if (!row.matched || !row.employeeId) continue;
    const sched = schedByEmp.get(row.employeeId) ?? defaultSched;
    const dutyDate = dutyDateFor(row.date, row.time, sched);
    if (row.hasConflict && !overwriteExisting) {
      skipKeys.add(`${row.employeeId}_${dutyDate}`);
      continue;
    }
    matched.push({
      employeeId: row.employeeId,
      date: row.date,
      time: row.time,
      status: row.status,
    });
  }

  const {
    records,
    keys,
    existingSourceByKey,
    correctionLockedKeys,
    touched,
    errors: buildErrors,
  } = await buildBiometricRecords(supabase, matched, schedByEmp, defaultSched);

  // Never overwrite a day a PERSON authored. One principle across all three
  // import paths: the device may correct its own records, never somebody's.
  //
  // This is the same rule runImportReplay applies (skip unless the existing row
  // is absent or still source = 'biometric'); before it was added here, a run
  // with "overwrite existing" ON upserted unconditionally and discarded every
  // manual entry, hand-edit and per-slot reason in range — including a blank
  // rest day tagged SATURDAY, which would revert to reading as an absence.
  //
  // correction_locked is checked as well as `source`, not instead of it:
  // migration 065 introduced the flag precisely so protection does not hinge on
  // a column other flows may reset. Today the two agree (buildCorrectionRecord
  // writes source 'manual'), and that redundancy is the point.
  //
  // The skip is unconditional rather than gated on `overwriteExisting`, because
  // with overwrite OFF these rows are already filtered into skipKeys — so this
  // only ever changes behaviour in the case that would have destroyed data.
  const toWrite: Record<string, unknown>[] = [];
  const toWriteTouched: typeof touched = [];
  let protectedSkipped = 0;
  for (let i = 0; i < records.length; i++) {
    const existingSource = existingSourceByKey.get(keys[i]);
    const humanAuthored =
      existingSource !== undefined && existingSource !== "biometric";
    if (humanAuthored || correctionLockedKeys.has(keys[i])) {
      // No overlap with skipKeys to worry about: a day filtered there never
      // reaches buildBiometricRecords, so it has no record and no key here.
      protectedSkipped++;
      continue;
    }
    toWrite.push(records[i]);
    toWriteTouched.push(touched[i]);
  }

  let imported = 0;
  let errors = buildErrors;
  const skipped = skipKeys.size + protectedSkipped;

  // Batch-upsert against the UNIQUE(employee_id, date) constraint instead of a
  // SELECT + INSERT/UPDATE per group. The old per-row loop did ~2 sequential DB
  // round-trips per record, which blew past the serverless function timeout on
  // large imports (3000+ punches). When overwrite is off, `ignoreDuplicates`
  // makes existing rows a no-op (conflicts are already filtered into skipKeys);
  // when on, it merges over the existing row. `.select("id")` returns only the
  // rows actually written, giving an accurate `imported` count either way.
  const CHUNK = 500;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const chunk = toWrite.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .upsert(chunk, {
          onConflict: "employee_id,date",
          ignoreDuplicates: !overwriteExisting,
        })
        .select("id");
      if (error) throw error;
      imported += data?.length ?? 0;
    } catch {
      errors += chunk.length;
    }
  }

  // Refresh VL ledger for every (employee, month) the import touched.
  if (toWriteTouched.length > 0) {
    await recomputeAttendanceDeductionsBatch(toWriteTouched);
  }

  // Save the raw punches so this import can be replayed after a bucketing fix.
  await saveImportBatch(supabase, user.id, previewRows);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import_attendance",
    tableName: "attendance_logs",
    newValues: {
      imported,
      skipped,
      protectedSkipped,
      errors,
      overwriteExisting,
      totalRows: previewRows.length,
    },
  });

  revalidatePath("/attendance");
  const matchedPunches = previewRows.filter((r) => r.matched).length;
  return {
    imported,
    skipped,
    /** Days left alone because a person authored them (manual entry, hand-edit
     *  or approved correction). Reported separately from `skipped` so the
     *  result can say what was PROTECTED, not just what was not written. */
    protectedSkipped,
    errors,
    totalPunches: previewRows.length,
    unmatchedPunches: previewRows.length - matchedPunches,
    dayRecords: records.length,
  };
}

// --- Import batches: list + replay ---

export interface ImportBatchRow {
  id: string;
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  punch_count: number;
  imported_by_name: string | null;
}

// Lists saved import batches, newest first, for the "Past Imports" list.
export async function getImportBatches(): Promise<ImportBatchRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select(
      "id, imported_at, period_start, period_end, punch_count, user_profiles(full_name, email)",
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
      imported_at: r.imported_at as string,
      period_start: r.period_start as string | null,
      period_end: r.period_end as string | null,
      punch_count: r.punch_count as number,
      imported_by_name: prof?.full_name ?? prof?.email ?? null,
    };
  });
}

// Loads a batch's raw punches and re-matches them to employees by biometric_no,
// resolving each matched employee's schedule. Shared by preview + run. Returns
// the matched punch list, schedule map, default schedule, and the count of
// punches whose biometric_no isn't in the system.
async function loadBatchForReplay(
  supabase: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<{
  matched: { employeeId: string; date: string; time: string; status: string }[];
  schedByEmp: Map<string, ScheduleLike>;
  defaultSched: ScheduleLike;
  unmatchedPunches: number;
}> {
  const { data: batch, error } = await supabase
    .schema("hris")
    .from("attendance_import_batches")
    .select("punches")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) throw new Error("Import not found");

  const punches = (batch.punches ?? []) as StoredPunch[];
  const uniqueNos = [...new Set(punches.map((p) => p.employeeNo))];
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

  const matched: {
    employeeId: string;
    date: string;
    time: string;
    status: string;
  }[] = [];
  let unmatchedPunches = 0;
  for (const p of punches) {
    const employeeId = empMap.get(p.employeeNo);
    if (!employeeId) {
      unmatchedPunches++;
      continue;
    }
    matched.push({ employeeId, date: p.date, time: p.time, status: p.status });
  }
  return { matched, schedByEmp, defaultSched, unmatchedPunches };
}

export interface ReplayPreview {
  daysToRebucket: number;
  daysToSkip: number;
  unmatchedPunches: number;
}

// Dry run: how many days a replay would re-bucket vs. skip (because the day is
// no longer a plain biometric row — a manager corrected it since). No writes.
export async function previewImportReplay(
  batchId: string,
): Promise<ReplayPreview> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { matched, schedByEmp, defaultSched, unmatchedPunches } =
    await loadBatchForReplay(supabase, batchId);
  const { keys, existingSourceByKey } = await buildBiometricRecords(
    supabase,
    matched,
    schedByEmp,
    defaultSched,
  );
  let daysToSkip = 0;
  for (const key of keys) {
    const src = existingSourceByKey.get(key);
    if (src !== undefined && src !== "biometric") daysToSkip++;
  }
  return {
    daysToRebucket: keys.length - daysToSkip,
    daysToSkip,
    unmatchedPunches,
  };
}

// Re-buckets a saved import with the current logic. Overwrites only days whose
// attendance_logs row is still source = 'biometric' (or absent); any day a
// manager manually edited since is left untouched.
export async function runImportReplay(batchId: string): Promise<{
  reBucketed: number;
  skipped: number;
  unmatchedPunches: number;
  errors: number;
}> {
  const user = await getCurrentUser();
  if (!user || !isAttendanceManager(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { matched, schedByEmp, defaultSched, unmatchedPunches } =
    await loadBatchForReplay(supabase, batchId);
  const { records, keys, existingSourceByKey, touched, errors: buildErrors } =
    await buildBiometricRecords(supabase, matched, schedByEmp, defaultSched);

  // Keep only records whose day is safe to overwrite: no existing row, or an
  // existing row still sourced from biometric. Skip anything a human touched.
  const toWrite: Record<string, unknown>[] = [];
  const toWriteTouched: typeof touched = [];
  let skipped = 0;
  for (let i = 0; i < records.length; i++) {
    const src = existingSourceByKey.get(keys[i]);
    if (src !== undefined && src !== "biometric") {
      skipped++;
      continue;
    }
    toWrite.push(records[i]);
    toWriteTouched.push(touched[i]);
  }

  let errors = buildErrors;
  let reBucketed = 0;
  const CHUNK = 500;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const chunk = toWrite.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .upsert(chunk, { onConflict: "employee_id,date", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      reBucketed += data?.length ?? 0;
    } catch {
      errors += chunk.length;
    }
  }

  if (toWriteTouched.length > 0) {
    await recomputeAttendanceDeductionsBatch(toWriteTouched);
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "replay_attendance_import",
    tableName: "attendance_logs",
    recordId: batchId,
    newValues: { reBucketed, skipped, unmatchedPunches, errors },
  });

  revalidatePath("/attendance");
  return { reBucketed, skipped, unmatchedPunches, errors };
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
  if (!user || !canPrintDtr(user.role)) throw new Error("Unauthorized");

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
  if (!user || !isAttendanceManager(user.role)) {
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
      if (log) {
        const isAbsent = (log.is_absent as boolean) ?? false;
        if (isAbsent) {
          daysAbsent++;
        } else {
          const tIn = log.time_in_am as string | null;
          const tOutAm = log.time_out_am as string | null;
          const tInPm = log.time_in_pm as string | null;
          const tOut = log.time_out_pm as string | null;
          const holidayExcuses = holidayExcusedSessions(
            holidayMap.get(day.date)?.type ?? null,
          );
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
          // Same DTR rule: undertime caps at 7h; 8h+ counts the day absent.
          const { lateMins: lm, undertimeMins: um, absent } =
            applyUndertimeAbsenceRule(lmRaw, umRaw, false);
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
      } else if (!day.isWeekend) {
        daysAbsent++;
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
