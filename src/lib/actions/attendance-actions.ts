"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";

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
    employee_no: string;
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
}

export interface DtrSummary {
  total_days_present: number;
  total_days_absent: number;
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

// --- Constants ---

const STANDARD_AM_IN = "08:00";
const STANDARD_AM_OUT = "12:00";
const STANDARD_PM_IN = "13:00";
const STANDARD_PM_OUT = "17:00";

// --- Helpers ---

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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

function calculateLateMinutes(timeInAm: string | null): number {
  if (!timeInAm) return 0;
  const actual = timeToMinutes(timeInAm);
  const standard = timeToMinutes(STANDARD_AM_IN);
  return Math.max(0, actual - standard);
}

function calculateUndertimeMinutes(timeOutPm: string | null): number {
  if (!timeOutPm) return 0;
  const actual = timeToMinutes(timeOutPm);
  const standard = timeToMinutes(STANDARD_PM_OUT);
  return Math.max(0, standard - actual);
}

function computeAttendanceFlags(entry: {
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
}) {
  const hasAnyLog = entry.time_in_am || entry.time_out_am || entry.time_in_pm || entry.time_out_pm;
  const lateMinutes = calculateLateMinutes(entry.time_in_am);
  const undertimeMinutes = calculateUndertimeMinutes(entry.time_out_pm);

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
      "*, employees!attendance_logs_employee_id_fkey(employee_no, first_name, last_name, departments!employees_department_id_fkey(name, code))"
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
  } else if (user.role === "department_head" && user.departmentId) {
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

  // Check for existing entry on this date for this employee
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", input.employee_id)
    .eq("date", input.date)
    .maybeSingle();

  const flags = computeAttendanceFlags(input);

  const record = {
    employee_id: input.employee_id,
    date: input.date,
    time_in_am: toTimestamp(input.date, input.time_in_am),
    time_out_am: toTimestamp(input.date, input.time_out_am),
    time_in_pm: toTimestamp(input.date, input.time_in_pm),
    time_out_pm: toTimestamp(input.date, input.time_out_pm),
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

  // Get all employee IDs mapped by biometric_no
  const uniqueNos = [...new Set(parsedRows.map((r) => r.employeeNo))];
  // Parse as integers since biometric_no is a number column
  const numericNos = uniqueNos.map(Number).filter((n) => !isNaN(n));
  const { data: employees } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, biometric_no")
    .in("biometric_no", numericNos);

  const empMap = new Map(
    (employees ?? []).map((e) => [String(e.biometric_no), e.id])
  );

  // Get existing attendance records for the date range
  const dates = [...new Set(parsedRows.map((r) => r.date))];
  const employeeIds = [...new Set((employees ?? []).map((e) => e.id))];

  let existingLogs: { employee_id: string; date: string }[] = [];
  if (employeeIds.length > 0 && dates.length > 0) {
    const { data } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date")
      .in("employee_id", employeeIds)
      .in("date", dates);
    existingLogs = data ?? [];
  }

  const existingSet = new Set(
    existingLogs.map((l) => `${l.employee_id}_${l.date}`)
  );

  return parsedRows.map((row) => {
    const employeeId = empMap.get(row.employeeNo) ?? null;
    const matched = employeeId !== null;
    const hasConflict =
      matched && existingSet.has(`${employeeId}_${row.date}`);

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

  // Group punches by employee+date to build AM/PM slots
  const grouped = new Map<
    string,
    { employeeId: string; date: string; punches: string[] }
  >();

  for (const row of previewRows) {
    if (!row.matched || !row.employeeId) continue;
    if (row.hasConflict && !overwriteExisting) continue;

    const key = `${row.employeeId}_${row.date}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: row.employeeId,
        date: row.date,
        punches: [],
      });
    }
    grouped.get(key)!.punches.push(row.time);
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const [, group] of grouped) {
    try {
      // Sort punches chronologically
      const punches = group.punches.sort();

      // Assign to AM/PM slots based on time
      // Logic: punches before noon are AM, after noon are PM
      // First punch in period = in, last punch in period = out
      const amPunches = punches.filter((t) => timeToMinutes(t) < timeToMinutes(STANDARD_AM_OUT));
      const pmPunches = punches.filter((t) => timeToMinutes(t) >= timeToMinutes(STANDARD_PM_IN));
      // Punches between 12:00-13:00 could be AM out or PM in
      const midPunches = punches.filter(
        (t) =>
          timeToMinutes(t) >= timeToMinutes(STANDARD_AM_OUT) &&
          timeToMinutes(t) < timeToMinutes(STANDARD_PM_IN)
      );

      // If there are mid-day punches, assign first to AM out if no AM out, rest to PM in
      if (midPunches.length > 0) {
        if (amPunches.length < 2) {
          amPunches.push(midPunches[0]);
        }
        if (midPunches.length > 1) {
          pmPunches.unshift(midPunches[midPunches.length - 1]);
        }
      }

      const timeInAm = amPunches.length > 0 ? amPunches[0] : null;
      const timeOutAm = amPunches.length > 1 ? amPunches[amPunches.length - 1] : null;
      const timeInPm = pmPunches.length > 0 ? pmPunches[0] : null;
      const timeOutPm = pmPunches.length > 1 ? pmPunches[pmPunches.length - 1] : null;

      const entry = {
        time_in_am: timeInAm,
        time_out_am: timeOutAm,
        time_in_pm: timeInPm,
        time_out_pm: timeOutPm,
      };

      const flags = computeAttendanceFlags(entry);

      const record = {
        employee_id: group.employeeId,
        date: group.date,
        time_in_am: toTimestamp(group.date, entry.time_in_am),
        time_out_am: toTimestamp(group.date, entry.time_out_am),
        time_in_pm: toTimestamp(group.date, entry.time_in_pm),
        time_out_pm: toTimestamp(group.date, entry.time_out_pm),
        ...flags,
        source: "biometric",
        remarks: null,
      };

      // Check if record exists
      const { data: existing } = await supabase
        .schema("hris")
        .from("attendance_logs")
        .select("id")
        .eq("employee_id", group.employeeId)
        .eq("date", group.date)
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
        } else {
          skipped++;
        }
      } else {
        const { error } = await supabase
          .schema("hris")
          .from("attendance_logs")
          .insert(record);
        if (error) throw error;
        imported++;
      }
    } catch {
      errors++;
    }
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

// --- DTR Data ---

export async function getDtrData(
  employeeId: string,
  month: number,
  year: number
): Promise<{ entries: DtrEntry[]; summary: DtrSummary; employee: {
  employee_no: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  departments: { name: string } | null;
  positions: { title: string } | null;
} | null }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  // Get employee info
  const { data: employee } = await supabase
    .schema("hris")
    .from("employees")
    .select("employee_no, first_name, last_name, middle_name, departments!employees_department_id_fkey(name), positions(title)")
    .eq("id", employeeId)
    .maybeSingle();

  // Build date range for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Fetch attendance logs for the month
  const { data: logs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  const logMap = new Map(
    (logs ?? []).map((l: Record<string, unknown>) => [l.date as string, l])
  );

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Build entries for each day of the month
  const entries: DtrEntry[] = [];
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLateCount = 0;
  let totalLateMinutes = 0;
  let totalUndertimeCount = 0;
  let totalUndertimeMinutes = 0;

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(year, month - 1, day);
    const dayOfWeek = dayNames[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    const log = logMap.get(dateStr) as Record<string, unknown> | undefined;

    if (log) {
      const isLate = (log.is_late as boolean) ?? false;
      const lateMins = (log.late_minutes as number) ?? 0;
      const isUndertime = (log.is_undertime as boolean) ?? false;
      const undertimeMins = (log.undertime_minutes as number) ?? 0;
      const isAbsent = (log.is_absent as boolean) ?? false;

      entries.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        time_in_am: extractTime(log.time_in_am as string | null),
        time_out_am: extractTime(log.time_out_am as string | null),
        time_in_pm: extractTime(log.time_in_pm as string | null),
        time_out_pm: extractTime(log.time_out_pm as string | null),
        is_late: isLate,
        late_minutes: lateMins,
        is_undertime: isUndertime,
        undertime_minutes: undertimeMins,
        is_absent: isAbsent,
        remarks: log.remarks as string | null,
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
      });
      if (!isWeekend) totalAbsent++;
    }
  }

  return {
    entries,
    summary: {
      total_days_present: totalPresent,
      total_days_absent: totalAbsent,
      total_late_count: totalLateCount,
      total_late_minutes: totalLateMinutes,
      total_undertime_count: totalUndertimeCount,
      total_undertime_minutes: totalUndertimeMinutes,
    },
    employee: employee as typeof employee & {
      departments: { name: string } | null;
      positions: { title: string } | null;
    },
  };
}

// --- DTR Summary Export (CSV) ---

export async function getDtrSummaryExport(
  month: number,
  year: number
): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Get all attendance for the month with employee info
  const { data: logs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "employee_id, date, is_late, late_minutes, is_undertime, undertime_minutes, is_absent, employees!attendance_logs_employee_id_fkey(employee_no, first_name, last_name)"
    )
    .gte("date", startDate)
    .lte("date", endDate)
    .order("employee_id")
    .order("date");

  // Group by employee
  const grouped = new Map<
    string,
    {
      employeeNo: string;
      name: string;
      present: number;
      absent: number;
      lateCount: number;
      lateMinutes: number;
      undertimeCount: number;
      undertimeMinutes: number;
    }
  >();

  for (const log of logs ?? []) {
    const emp = log.employees as unknown as { employee_no: string; first_name: string; last_name: string } | null;
    if (!emp) continue;

    const key = log.employee_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeNo: emp.employee_no,
        name: `${emp.last_name}, ${emp.first_name}`,
        present: 0,
        absent: 0,
        lateCount: 0,
        lateMinutes: 0,
        undertimeCount: 0,
        undertimeMinutes: 0,
      });
    }

    const entry = grouped.get(key)!;
    if (log.is_absent) {
      entry.absent++;
    } else {
      entry.present++;
    }
    if (log.is_late) {
      entry.lateCount++;
      entry.lateMinutes += log.late_minutes ?? 0;
    }
    if (log.is_undertime) {
      entry.undertimeCount++;
      entry.undertimeMinutes += log.undertime_minutes ?? 0;
    }
  }

  // Build CSV
  const headers = [
    "Employee No",
    "Name",
    "Days Present",
    "Days Absent",
    "Late Count",
    "Total Late (mins)",
    "Undertime Count",
    "Total Undertime (mins)",
  ];

  const rows = [...grouped.values()].map((e) =>
    [
      e.employeeNo,
      `"${e.name}"`,
      e.present,
      e.absent,
      e.lateCount,
      e.lateMinutes,
      e.undertimeCount,
      e.undertimeMinutes,
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

// --- Delete attendance entry ---

export async function deleteAttendanceEntry(id: string) {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .delete()
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/attendance");
  return { success: true };
}
