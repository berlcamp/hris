"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { isDeptScoped } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_SCHEDULE,
  bucketPunchesForDuty,
  crossesMidnight,
  dutyDateFor,
  hasBreak,
  lateMinutesFor,
  trimTimeStr,
  undertimeMinutesFor,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import {
  recomputeAttendanceDeductionFor,
  recomputeAttendanceDeductionsBatch,
} from "@/lib/actions/attendance-deduction-actions";

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
  employees: {
    first_name: string;
    last_name: string;
    departments: { name: string; code: string } | null;
  } | null;
}

export interface DtrEntry {
  date: string;
  day_of_week: string;
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
  leave_type: string | null;
}

export interface DtrSummary {
  total_days_present: number;
  total_days_absent: number;
  total_days_on_leave: number;
  total_late_count: number;
  total_late_minutes: number;
  total_undertime_count: number;
  total_undertime_minutes: number;
}

export interface DahuaParsedRow {
  employeeNo: string;
  employeeName: string;
  date: string;
  time: string;
  status: string;
  matched: boolean;
  employeeId: string | null;
}

export interface ImportPreviewRow extends DahuaParsedRow {
  hasConflict: boolean;
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

/** Extract HH:MM from a TIMESTAMPTZ or ISO string */
function extractTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** True if a stored TIMESTAMPTZ's calendar date is after the row's duty date. */
function timestampOnNextDay(
  timestamp: string | null,
  dutyDate: string,
): boolean {
  if (!timestamp) return false;
  return timestamp.slice(0, 10) > dutyDate;
}

function computeAttendanceFlags(
  entry: {
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    time_in_am_next_day?: boolean;
    time_out_pm_next_day?: boolean;
  },
  dutyDate: string,
  sched: ScheduleLike,
) {
  const hasAnyLog =
    entry.time_in_am || entry.time_out_am || entry.time_in_pm || entry.time_out_pm;
  // For no-break shifts the single in/out lives in time_in_am / time_out_pm;
  // for has-break shifts the morning in / evening out are the late/undertime
  // anchors. Either way, time_in_am and time_out_pm are correct.
  const lateMinutes = lateMinutesFor(
    dutyDate,
    sched,
    entry.time_in_am,
    entry.time_in_am_next_day ?? false,
  );
  const undertimeMinutes = undertimeMinutesFor(
    dutyDate,
    sched,
    entry.time_out_pm,
    entry.time_out_pm_next_day ?? false,
  );

  return {
    is_late: lateMinutes > 0,
    late_minutes: lateMinutes,
    is_undertime: undertimeMinutes > 0,
    undertime_minutes: undertimeMinutes,
    is_absent: !hasAnyLog,
  };
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
      "*, employees!attendance_logs_employee_id_fkey(first_name, last_name, departments!employees_department_id_fkey(name, code))"
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

// --- Manual Attendance Entry ---

export async function createAttendanceEntry(input: {
  employee_id: string;
  date: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  remarks?: string;
}) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  // Resolve the employee's schedule so manual entry uses the same late /
  // undertime baseline as the importer.
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "schedules(id, time_in, time_out, break_start, break_end)",
    )
    .eq("id", input.employee_id)
    .maybeSingle();
  const sched: ScheduleLike =
    (emp?.schedules as unknown as ScheduleLike | null) ?? DEFAULT_SCHEDULE;

  // Check for existing entry on this date for this employee
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", input.employee_id)
    .eq("date", input.date)
    .maybeSingle();

  // For night shifts, any HH:MM that precedes the shift's time_in is
  // interpreted as the next calendar day (e.g. a 05:00 clock-out for a
  // 22:00–05:00 shift). Day shifts always stay on the duty date.
  const isNight = crossesMidnight(sched);
  const dateFor = (t: string | null): string => {
    if (!t) return input.date;
    if (!isNight) return input.date;
    return t < sched.time_in ? addDaysIso(input.date, 1) : input.date;
  };
  const nextDay = (t: string | null): boolean =>
    !!t && isNight && t < sched.time_in;

  const flags = computeAttendanceFlags(
    {
      ...input,
      time_in_am_next_day: nextDay(input.time_in_am),
      time_out_pm_next_day: nextDay(input.time_out_pm),
    },
    input.date,
    sched,
  );

  const record = {
    employee_id: input.employee_id,
    date: input.date,
    time_in_am: toTimestamp(dateFor(input.time_in_am), input.time_in_am),
    time_out_am: toTimestamp(dateFor(input.time_out_am), input.time_out_am),
    time_in_pm: toTimestamp(dateFor(input.time_in_pm), input.time_in_pm),
    time_out_pm: toTimestamp(dateFor(input.time_out_pm), input.time_out_pm),
    remarks: input.remarks || null,
    source: "manual",
    ...flags,
  };

  if (existing) {
    // Update existing
    const { error } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .update(record)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    // Insert new
    const { error } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .insert(record);
    if (error) throw error;
  }

  // Keep the VL ledger in sync with the (possibly mid-month) edit.
  const [y, m] = input.date.split("-").map(Number);
  await recomputeAttendanceDeductionFor(input.employee_id, y, m);

  revalidatePath("/attendance");
  return { success: true };
}

// --- Dahua XML Parsing ---
// Dahua face recognition devices export attendance via USB as SpreadsheetML XML.
// Format: Row 1 = title, Row 2 = date range, Row 3 = headers, Row 4+ = data
// Headers: No., No.(employee), Name, Recorded Time, Recognition Mode, Status, Attendance Status, Face Mask

function extractCellValues(rowXml: string): string[] {
  const values: string[] = [];
  // Match each Cell, handling MergeAcross which means the cell spans multiple columns
  const cellRegex = /<Cell[^>]*?(?:ss:MergeAcross="(\d+)")?[^>]*>\s*(?:<Data[^>]*>(.*?)<\/Data>)?/gs;
  let match;
  while ((match = cellRegex.exec(rowXml)) !== null) {
    const mergeAcross = match[1] ? parseInt(match[1], 10) : 0;
    const value = match[2] ?? "";
    values.push(value);
    // MergeAcross means this cell spans extra columns
    for (let i = 0; i < mergeAcross; i++) {
      values.push("");
    }
  }
  return values;
}

export async function parseDahuaFile(content: string): Promise<DahuaParsedRow[]> {
  // Detect format: XML (SpreadsheetML) or CSV
  const trimmed = content.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Workbook")) {
    return parseDahuaXml(trimmed);
  }
  return parseDahuaCsv(trimmed);
}

function parseDahuaXml(xmlContent: string): DahuaParsedRow[] {
  const rows: DahuaParsedRow[] = [];

  // Extract all <Row> elements
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const allRows: string[] = [];
  let match;
  while ((match = rowRegex.exec(xmlContent)) !== null) {
    allRows.push(match[1]);
  }

  // Find the header row index (contains "Recorded Time" or "Name")
  let headerIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const cells = extractCellValues(allRows[i]);
    if (cells.some((c) => c === "Recorded Time" || c === "Name")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return [];

  // Data rows start after the header
  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const cells = extractCellValues(allRows[i]);
    // Need at least: No., EmployeeNo, Name, RecordedTime
    if (cells.length < 4) continue;

    const idNo = cells[1]?.trim();
    const name = cells[2]?.trim();
    const dateTime = cells[3]?.trim();

    if (!idNo || !name || !dateTime) continue;

    // Parse date and time from "2026-04-15 11:54:25"
    const dtMatch = dateTime.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    if (!dtMatch) continue;

    const date = dtMatch[1].replace(/\//g, "-");
    const time = dtMatch[2].substring(0, 5); // HH:MM

    // Attendance Status is column index 6 (e.g., "Break Out", "Check-In")
    const status = cells[6]?.trim() || "";

    rows.push({
      employeeNo: idNo,
      employeeName: name,
      date,
      time,
      status: status.toLowerCase(),
      matched: false,
      employeeId: null,
    });
  }

  return rows;
}

function parseDahuaCsv(csvContent: string): DahuaParsedRow[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];

  // Detect header line - skip it
  const headerLine = lines[0].toLowerCase();
  const startIndex = headerLine.includes("no") || headerLine.includes("id") ? 1 : 0;

  const rows: DahuaParsedRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 4) continue;

    let idNo: string;
    let name: string;
    let dateTime: string;
    let status: string;

    if (parts.length >= 5) {
      idNo = parts[1];
      name = parts[2];
      dateTime = parts[3];
      status = parts[4] || "";
    } else {
      idNo = parts[0];
      name = parts[1];
      dateTime = parts[2];
      status = parts[3] || "";
    }

    const dtMatch = dateTime.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    if (!dtMatch) continue;

    const date = dtMatch[1].replace(/\//g, "-");
    const time = dtMatch[2].substring(0, 5);

    rows.push({
      employeeNo: idNo,
      employeeName: name,
      date,
      time,
      status: status.toLowerCase(),
      matched: false,
      employeeId: null,
    });
  }

  return rows;
}

// --- Match parsed rows to employees and check conflicts ---

export async function matchAndPreviewImport(
  parsedRows: DahuaParsedRow[]
): Promise<ImportPreviewRow[]> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
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
  const schedByEmp = new Map<string, ScheduleLike>(
    empRows.map((e) => [e.id, e.schedules ?? DEFAULT_SCHEDULE]),
  );

  // Compute duty dates per parsed row using each employee's schedule so the
  // preview reports conflicts against the bucket the importer will actually
  // write to (matters for night shifts).
  const previewWithDuty = parsedRows.map((row) => {
    const employeeId = empMap.get(row.employeeNo) ?? null;
    const sched = employeeId
      ? schedByEmp.get(employeeId) ?? DEFAULT_SCHEDULE
      : DEFAULT_SCHEDULE;
    const duty = employeeId ? dutyDateFor(row.date, row.time, sched) : row.date;
    return { row, employeeId, duty };
  });

  const dutyDates = [
    ...new Set(previewWithDuty.map((p) => p.duty)),
  ];
  const employeeIds = [...new Set(empRows.map((e) => e.id))];

  let existingLogs: { employee_id: string; date: string }[] = [];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    existingLogs = data ?? [];
  }

  const existingSet = new Set(
    existingLogs.map((l) => `${l.employee_id}_${l.date}`),
  );

  return previewWithDuty.map(({ row, employeeId, duty }) => {
    const matched = employeeId !== null;
    const hasConflict =
      matched && existingSet.has(`${employeeId}_${duty}`);

    return {
      ...row,
      matched,
      employeeId,
      hasConflict,
      conflictDetails: hasConflict
        ? "Existing record will be updated"
        : !matched
        ? "Employee not found in system"
        : null,
    };
  });
}

// --- Import Dahua attendance data ---

export async function importDahuaAttendance(
  previewRows: ImportPreviewRow[],
  overwriteExisting: boolean
): Promise<{ imported: number; skipped: number; errors: number }> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
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
      schedByEmp.set(e.id, e.schedules ?? DEFAULT_SCHEDULE);
    }
  }

  // Group punches by employee + duty date.
  interface Group {
    employeeId: string;
    dutyDate: string;
    sched: ScheduleLike;
    punches: { date: string; time: string }[];
  }
  const grouped = new Map<string, Group>();
  const skipKeys = new Set<string>();

  for (const row of previewRows) {
    if (!row.matched || !row.employeeId) continue;
    const sched = schedByEmp.get(row.employeeId) ?? DEFAULT_SCHEDULE;
    const dutyDate = dutyDateFor(row.date, row.time, sched);
    const key = `${row.employeeId}_${dutyDate}`;
    if (row.hasConflict && !overwriteExisting) {
      skipKeys.add(key);
      continue;
    }
    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: row.employeeId,
        dutyDate,
        sched,
        punches: [],
      });
    }
    grouped.get(key)!.punches.push({ date: row.date, time: row.time });
  }

  let imported = 0;
  let errors = 0;
  const skipped = skipKeys.size;
  const touched: { employeeId: string; year: number; month: number }[] = [];

  for (const [, group] of grouped) {
    try {
      const bucket = bucketPunchesForDuty(
        group.punches,
        group.dutyDate,
        group.sched,
      );

      const flags = computeAttendanceFlags(
        {
          time_in_am: bucket.time_in_am,
          time_out_am: bucket.time_out_am,
          time_in_pm: bucket.time_in_pm,
          time_out_pm: bucket.time_out_pm,
          time_in_am_next_day: bucket.time_in_am_next_day,
          time_out_pm_next_day: bucket.time_out_pm_next_day,
        },
        group.dutyDate,
        group.sched,
      );

      const nextDate = addDaysIso(group.dutyDate, 1);
      const dateOf = (onNext: boolean) => (onNext ? nextDate : group.dutyDate);

      const record = {
        employee_id: group.employeeId,
        date: group.dutyDate,
        time_in_am: toTimestamp(dateOf(bucket.time_in_am_next_day), bucket.time_in_am),
        time_out_am: toTimestamp(dateOf(bucket.time_out_am_next_day), bucket.time_out_am),
        time_in_pm: toTimestamp(dateOf(bucket.time_in_pm_next_day), bucket.time_in_pm),
        time_out_pm: toTimestamp(dateOf(bucket.time_out_pm_next_day), bucket.time_out_pm),
        ...flags,
        source: "biometric",
        remarks: null,
      };

      const { data: existing } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .select("id")
        .eq("employee_id", group.employeeId)
        .eq("date", group.dutyDate)
        .maybeSingle();

      if (existing) {
        if (overwriteExisting) {
          const { error } = await supabase
            .schema("hris")
            .from("attendance_logs")
            .update(record)
            .eq("id", existing.id);
          if (error) throw error;
          imported++;
          const [yr, mo] = group.dutyDate.split("-").map(Number);
          touched.push({ employeeId: group.employeeId, year: yr, month: mo });
        }
      } else {
        const { error } = await supabase
          .schema("hris")
          .from("attendance_logs")
          .insert(record);
        if (error) throw error;
        imported++;
        const [yr, mo] = group.dutyDate.split("-").map(Number);
        touched.push({ employeeId: group.employeeId, year: yr, month: mo });
      }
    } catch {
      errors++;
    }
  }

  // Refresh VL ledger for every (employee, month) the import touched.
  if (touched.length > 0) {
    await recomputeAttendanceDeductionsBatch(touched);
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import_attendance",
    tableName: "attendance_logs",
    newValues: { imported, skipped, errors, overwriteExisting, totalRows: previewRows.length },
  });

  revalidatePath("/attendance");
  return { imported, skipped, errors };
}

// --- Bulk DTR (department + date range) ---

export interface BulkDtrEmployee {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  departments: { name: string } | null;
  positions: { title: string } | null;
  plantilla: { position_title: string | null }[] | null;
}

export interface DtrScheduleInfo {
  name: string;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
  has_break: boolean;
}

export interface BulkDtrResult {
  employee: BulkDtrEmployee;
  entries: DtrEntry[];
  summary: DtrSummary;
  schedule: DtrScheduleInfo;
}

export async function getDepartmentDtrBulk(
  departmentId: string,
  startDate: string,
  endDate: string,
): Promise<{ department: { id: string; name: string } | null; results: BulkDtrResult[] }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Dept-scoped users (non-composite) may only export their own department
  if (
    isDeptScoped(user.role) &&
    user.role !== "department_admin_and_department_head" &&
    user.departmentId &&
    departmentId !== user.departmentId
  ) {
    throw new Error("Unauthorized");
  }

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
    .select("id, name")
    .eq("id", departmentId)
    .maybeSingle();

  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, departments!employees_department_id_fkey(name), positions(title), plantilla(position_title), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .eq("department_id", departmentId)
    .eq("status", "active")
    .eq("employment_type", "plantilla")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const employeeRowsAll = (employees ?? []) as unknown as (BulkDtrEmployee & {
    schedules: (ScheduleLike & { name: string }) | null;
  })[];
  if (employeeRowsAll.length === 0) {
    return { department: department ?? null, results: [] };
  }

  // Restrict to employees who actually have attendance_logs in the range —
  // "inclusion" is implicit by the presence of records.
  const { data: withLogs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("employee_id")
    .in("employee_id", employeeRowsAll.map((e) => e.id))
    .gte("date", startDate)
    .lte("date", endDate);
  const withLogsSet = new Set(
    (withLogs ?? []).map((r) => r.employee_id as string),
  );
  const employeeRows = employeeRowsAll.filter((e) => withLogsSet.has(e.id));
  if (employeeRows.length === 0) {
    return { department: department ?? null, results: [] };
  }

  const empIds = employeeRows.map((e) => e.id);

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select(
        "employee_id, date, time_in_am, time_out_am, time_in_pm, time_out_pm, is_late, late_minutes, is_undertime, undertime_minutes, is_absent, remarks",
      )
      .in("employee_id", empIds)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select("employee_id, start_date, end_date, leave_dates, leave_types(code)")
      .in("employee_id", empIds)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  // Index logs and leaves per employee
  const logsByEmp = new Map<string, Map<string, Record<string, unknown>>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    const empId = log.employee_id as string;
    if (!logsByEmp.has(empId)) logsByEmp.set(empId, new Map());
    logsByEmp.get(empId)!.set(log.date as string, log);
  }

  const leavesByEmp = new Map<string, Map<string, string>>();
  for (const leave of (leaves ?? []) as unknown as {
    employee_id: string;
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
    leave_types: { code: string } | null;
  }[]) {
    if (!leavesByEmp.has(leave.employee_id)) leavesByEmp.set(leave.employee_id, new Map());
    const map = leavesByEmp.get(leave.employee_id)!;
    const code = leave.leave_types?.code ?? "Leave";
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) map.set(d, code);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          map.set(key, code);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  // Build the calendar between startDate and endDate inclusive
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const calendar: { date: string; dayOfWeek: string; isWeekend: boolean }[] = [];
  {
    const d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (d <= end) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      calendar.push({
        date: dateStr,
        dayOfWeek: dayNames[dow],
        isWeekend: dow === 0 || dow === 6,
      });
      d.setDate(d.getDate() + 1);
    }
  }

  const results: BulkDtrResult[] = employeeRows.map((emp) => {
    const logMap = logsByEmp.get(emp.id) ?? new Map<string, Record<string, unknown>>();
    const leaveMap = leavesByEmp.get(emp.id) ?? new Map<string, string>();
    const sched = emp.schedules ?? DEFAULT_SCHEDULE;

    const entries: DtrEntry[] = [];
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalOnLeave = 0;
    let totalLateCount = 0;
    let totalLateMinutes = 0;
    let totalUndertimeCount = 0;
    let totalUndertimeMinutes = 0;

    for (const day of calendar) {
      const log = logMap.get(day.date);
      const leaveCode = leaveMap.get(day.date) ?? null;

      if (log) {
        const isAbsent = (log.is_absent as boolean) ?? false;
        const tInAmRaw = log.time_in_am as string | null;
        const tOutPmRaw = log.time_out_pm as string | null;
        // Recompute late/undertime against the *current* schedule so the
        // footer always agrees with the "Official hours" line, even when the
        // employee's schedule was changed after import.
        const lateMins = lateMinutesFor(
          day.date,
          sched,
          extractTime(tInAmRaw),
          timestampOnNextDay(tInAmRaw, day.date),
        );
        const undertimeMins = undertimeMinutesFor(
          day.date,
          sched,
          extractTime(tOutPmRaw),
          timestampOnNextDay(tOutPmRaw, day.date),
        );
        const isLate = lateMins > 0;
        const isUndertime = undertimeMins > 0;

        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: extractTime(tInAmRaw),
          time_out_am: extractTime(log.time_out_am as string | null),
          time_in_pm: extractTime(log.time_in_pm as string | null),
          time_out_pm: extractTime(tOutPmRaw),
          is_late: isLate,
          late_minutes: lateMins,
          is_undertime: isUndertime,
          undertime_minutes: undertimeMins,
          is_absent: isAbsent,
          remarks: (log.remarks as string | null) ?? null,
          leave_type: leaveCode,
        });

        if (!isAbsent) totalPresent++;
        else totalAbsent++;
        if (isLate) {
          totalLateCount++;
          totalLateMinutes += lateMins;
        }
        if (isUndertime) {
          totalUndertimeCount++;
          totalUndertimeMinutes += undertimeMins;
        }
      } else if (!day.isWeekend && leaveCode) {
        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          is_late: false,
          late_minutes: 0,
          is_undertime: false,
          undertime_minutes: 0,
          is_absent: false,
          remarks: leaveCode,
          leave_type: leaveCode,
        });
        totalOnLeave++;
      } else {
        entries.push({
          date: day.date,
          day_of_week: day.dayOfWeek,
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          is_late: false,
          late_minutes: 0,
          is_undertime: false,
          undertime_minutes: 0,
          is_absent: !day.isWeekend,
          remarks: day.isWeekend ? "Weekend" : null,
          leave_type: null,
        });
        if (!day.isWeekend) totalAbsent++;
      }
    }

    return {
      employee: {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        middle_name: emp.middle_name,
        departments: emp.departments,
        positions: emp.positions,
        plantilla: emp.plantilla,
      },
      entries,
      summary: {
        total_days_present: totalPresent,
        total_days_absent: totalAbsent,
        total_days_on_leave: totalOnLeave,
        total_late_count: totalLateCount,
        total_late_minutes: totalLateMinutes,
        total_undertime_count: totalUndertimeCount,
        total_undertime_minutes: totalUndertimeMinutes,
      },
      schedule: {
        name: emp.schedules?.name ?? "Default 8:00–17:00",
        time_in: trimTimeStr(sched.time_in)!,
        time_out: trimTimeStr(sched.time_out)!,
        break_start: trimTimeStr(sched.break_start),
        break_end: trimTimeStr(sched.break_end),
        has_break: hasBreak(sched),
      },
    };
  });

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
    .select(
      "id, first_name, last_name, middle_name, department_id, user_profile_id, departments!employees_department_id_fkey(name), positions(title), plantilla(position_title), schedules(id, name, time_in, time_out, break_start, break_end)",
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return null;

  // Employees may only fetch their own DTR.
  if (user.role === "employee" && (employee as { user_profile_id: string | null }).user_profile_id !== user.id) {
    throw new Error("Unauthorized");
  }

  // Dept-scoped users (non-composite) may only fetch DTRs for employees in
  // their own department.
  if (
    isDeptScoped(user.role) &&
    user.role !== "department_admin_and_department_head" &&
    user.departmentId &&
    (employee as { department_id: string | null }).department_id !== user.departmentId
  ) {
    throw new Error("Unauthorized");
  }

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select(
        "date, time_in_am, time_out_am, time_in_pm, time_out_pm, is_late, late_minutes, is_undertime, undertime_minutes, is_absent, remarks",
      )
      .eq("employee_id", employeeId)
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .schema("hris")
      .from("leave_applications")
      .select("start_date, end_date, leave_dates, leave_types(code)")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  const logMap = new Map<string, Record<string, unknown>>();
  for (const log of (logs ?? []) as Record<string, unknown>[]) {
    logMap.set(log.date as string, log);
  }

  const leaveMap = new Map<string, string>();
  for (const leave of (leaves ?? []) as unknown as {
    start_date: string;
    end_date: string;
    leave_dates: string[] | null;
    leave_types: { code: string } | null;
  }[]) {
    const code = leave.leave_types?.code ?? "Leave";
    const dates = leave.leave_dates;
    if (dates && dates.length > 0) {
      for (const d of dates) leaveMap.set(d, code);
    } else {
      const d = new Date(leave.start_date + "T00:00:00");
      const end = new Date(leave.end_date + "T00:00:00");
      while (d <= end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          leaveMap.set(key, code);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const entries: DtrEntry[] = [];
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalOnLeave = 0;
  let totalLateCount = 0;
  let totalLateMinutes = 0;
  let totalUndertimeCount = 0;
  let totalUndertimeMinutes = 0;

  // Resolve current schedule once so late/undertime per row reflect the
  // schedule the employee is assigned to *now* (not whatever was stamped at
  // import time).
  const empSchedule =
    ((employee as unknown) as { schedules: ScheduleLike | null }).schedules ??
    DEFAULT_SCHEDULE;

  const cursor = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (cursor <= end) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const dow = cursor.getDay();
    const dayOfWeek = dayNames[dow];
    const isWeekend = dow === 0 || dow === 6;
    const log = logMap.get(dateStr);
    const leaveCode = leaveMap.get(dateStr) ?? null;

    if (log) {
      const isAbsent = (log.is_absent as boolean) ?? false;
      const tInAmRaw = log.time_in_am as string | null;
      const tOutPmRaw = log.time_out_pm as string | null;
      const lateMins = lateMinutesFor(
        dateStr,
        empSchedule,
        extractTime(tInAmRaw),
        timestampOnNextDay(tInAmRaw, dateStr),
      );
      const undertimeMins = undertimeMinutesFor(
        dateStr,
        empSchedule,
        extractTime(tOutPmRaw),
        timestampOnNextDay(tOutPmRaw, dateStr),
      );
      const isLate = lateMins > 0;
      const isUndertime = undertimeMins > 0;

      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: extractTime(tInAmRaw),
        time_out_am: extractTime(log.time_out_am as string | null),
        time_in_pm: extractTime(log.time_in_pm as string | null),
        time_out_pm: extractTime(tOutPmRaw),
        is_late: isLate,
        late_minutes: lateMins,
        is_undertime: isUndertime,
        undertime_minutes: undertimeMins,
        is_absent: isAbsent,
        remarks: (log.remarks as string | null) ?? null,
        leave_type: leaveCode,
      });

      if (!isAbsent) totalPresent++;
      else totalAbsent++;
      if (isLate) {
        totalLateCount++;
        totalLateMinutes += lateMins;
      }
      if (isUndertime) {
        totalUndertimeCount++;
        totalUndertimeMinutes += undertimeMins;
      }
    } else if (!isWeekend && leaveCode) {
      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: null,
        time_out_am: null,
        time_in_pm: null,
        time_out_pm: null,
        is_late: false,
        late_minutes: 0,
        is_undertime: false,
        undertime_minutes: 0,
        is_absent: false,
        remarks: leaveCode,
        leave_type: leaveCode,
      });
      totalOnLeave++;
    } else {
      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: null,
        time_out_am: null,
        time_in_pm: null,
        time_out_pm: null,
        is_late: false,
        late_minutes: 0,
        is_undertime: false,
        undertime_minutes: 0,
        is_absent: !isWeekend,
        remarks: isWeekend ? "Weekend" : null,
        leave_type: null,
      });
      if (!isWeekend) totalAbsent++;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const emp = employee as unknown as BulkDtrEmployee & {
    schedules: (ScheduleLike & { name: string }) | null;
  };
  return {
    employee: {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      middle_name: emp.middle_name,
      departments: emp.departments,
      positions: emp.positions,
      plantilla: emp.plantilla,
    },
    entries,
    summary: {
      total_days_present: totalPresent,
      total_days_absent: totalAbsent,
      total_days_on_leave: totalOnLeave,
      total_late_count: totalLateCount,
      total_late_minutes: totalLateMinutes,
      total_undertime_count: totalUndertimeCount,
      total_undertime_minutes: totalUndertimeMinutes,
    },
    schedule: {
      name: emp.schedules?.name ?? "Default 8:00–17:00",
      time_in: trimTimeStr(empSchedule.time_in)!,
      time_out: trimTimeStr(empSchedule.time_out)!,
      break_start: trimTimeStr(empSchedule.break_start),
      break_end: trimTimeStr(empSchedule.break_end),
      has_break: hasBreak(empSchedule),
    },
  };
}

// --- Delete attendance entry ---

export async function deleteAttendanceEntry(id: string) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  // Capture employee + duty date before deletion so we can refresh the VL
  // ledger for that month after the row is gone.
  const { data: row } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("employee_id, date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .delete()
    .eq("id", id);

  if (error) throw error;

  if (row?.employee_id && row?.date) {
    const [yr, mo] = String(row.date).split("-").map(Number);
    await recomputeAttendanceDeductionFor(row.employee_id as string, yr, mo);
  }

  revalidatePath("/attendance");
  return { success: true };
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
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
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

  const [{ data: logs }, { data: leaves }] = await Promise.all([
    supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date, time_in_am, time_out_pm, is_absent")
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
  return empRows
    .filter((e) => (logsByEmp.get(e.id)?.size ?? 0) > 0)
    .map((emp) => {
    const sched = emp.schedules ?? DEFAULT_SCHEDULE;
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
          daysPresent++;
          const tIn = log.time_in_am as string | null;
          const tOut = log.time_out_pm as string | null;
          const lm = lateMinutesFor(
            day.date,
            sched,
            extractTime(tIn),
            timestampOnNextDay(tIn, day.date),
          );
          const um = undertimeMinutesFor(
            day.date,
            sched,
            extractTime(tOut),
            timestampOnNextDay(tOut, day.date),
          );
          if (lm > 0) {
            lateCount++;
            lateMinutes += lm;
          }
          if (um > 0) {
            undertimeCount++;
            undertimeMinutes += um;
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
