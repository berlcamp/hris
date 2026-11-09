"use server";

// Per-date schedule overrides (migration 094) and the calendar view of what
// each day resolves to. Schedule managers (super admin / DTR manager) set them
// for anyone, department admins for their own department's employees.
//
// Rotations were removed from the app. Their tables and the rotation step in
// the resolver remain, but nothing creates or assigns a rotation any more.
//
// Every change that can move a punch re-sorts the affected days from the raw
// punch pool (schedule-resort.ts) — from the change's date, never before the
// start of the previous month — and refreshes the VL deduction for the months
// it touched. Hand-corrected days are never touched.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageSchedules, isDeptAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { recomputeAttendanceDeductionsBatch } from "@/lib/actions/attendance-deduction-actions";
import { loadScheduleContext } from "@/lib/schedule-context";
import { manilaToday } from "@/lib/format-date";
import { resortEmployeesInRange, resortWindow } from "@/lib/schedule-resort";
import type { ResortResult } from "@/lib/punch-pool";

type Admin = ReturnType<typeof createAdminClient>;
type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResortSummary {
  written: number;
  cleared: number;
  protectedSkipped: number;
}

// --- Authorization -------------------------------------------------------

async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function canSetSchedules(user: CurrentUser): boolean {
  return canManageSchedules(user.roles) || isDeptAdmin(user.roles);
}

/** Schedule managers reach everyone; a department admin only their own department. */
async function requireScope(supabase: Admin, user: CurrentUser, employeeIds: string[]) {
  if (canManageSchedules(user.roles)) return;
  if (!isDeptAdmin(user.roles) || !user.departmentId) {
    throw new Error("You do not have permission to set schedules.");
  }
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, department_id")
    .in("id", employeeIds);
  if (error) throw error;
  const outside = (data ?? []).filter((e) => e.department_id !== user.departmentId);
  if (outside.length > 0 || (data ?? []).length !== new Set(employeeIds).size) {
    throw new Error("You can only set schedules for employees in your own department.");
  }
}

// --- Re-sort --------------------------------------------------------------

async function resortAfterChange(
  supabase: Admin,
  employeeIds: string[],
  effectiveFrom: string,
  to?: string,
): Promise<ResortSummary> {
  const window = resortWindow(effectiveFrom, manilaToday());
  if (!window) return { written: 0, cleared: 0, protectedSkipped: 0 };
  const result: ResortResult = await resortEmployeesInRange(
    supabase,
    employeeIds,
    window.from,
    to && to < window.to ? to : window.to,
  );
  if (result.touched.length > 0) {
    await recomputeAttendanceDeductionsBatch(result.touched);
  }
  revalidatePath("/attendance");
  revalidatePath("/dtr");
  return {
    written: result.written,
    cleared: result.cleared,
    protectedSkipped: result.protectedSkipped,
  };
}

// --- Employees --------------------------------------------------------------

export interface AssignableEmployee {
  id: string;
  name: string;
  biometric_no: number | null;
  department_id: string | null;
  department: string | null;
  base_schedule: string | null;
}

export async function getAssignableEmployees(): Promise<AssignableEmployee[]> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, biometric_no, department_id, departments!employees_department_id_fkey(name), schedules(name)",
    )
    .eq("status", "active")
    .order("last_name");
  if (!canManageSchedules(user.roles)) query = query.eq("department_id", user.departmentId ?? "");
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((e) => {
    const row = e as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      biometric_no: number | null;
      department_id: string | null;
      departments: { name: string } | null;
      schedules: { name: string } | null;
    };
    return {
      id: row.id,
      name: [row.last_name, row.first_name].filter(Boolean).join(", "),
      biometric_no: row.biometric_no,
      department_id: row.department_id,
      department: row.departments?.name ?? null,
      base_schedule: row.schedules?.name ?? null,
    };
  });
}

// --- Per-date overrides and the calendar --------------------------------

export interface CalendarDay {
  date: string;
  restDay: boolean;
  source: "pin" | "override" | "rotation" | "base";
  schedule_id: string | null;
  schedule_name: string | null;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
  override_note: string | null;
}

export async function getScheduleCalendar(
  employeeId: string,
  month: string,
): Promise<{ days: CalendarDay[] }> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("Unauthorized");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  const supabase = createAdminClient();
  await requireScope(supabase, user, [employeeId]);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [resolve, { data: logs }, { data: overrides }, { data: schedules }] =
    await Promise.all([
      loadScheduleContext(supabase, [employeeId], first, last),
      supabase
        .schema("hris")
        .from("attendance_logs")
        .select("date, schedule_id")
        .eq("employee_id", employeeId)
        .gte("date", first)
        .lte("date", last)
        .not("schedule_id", "is", null),
      supabase
        .schema("hris")
        .from("schedule_overrides")
        .select("date, note")
        .eq("employee_id", employeeId)
        .gte("date", first)
        .lte("date", last),
      supabase.schema("hris").from("schedules").select("id, name, time_in, time_out, break_start, break_end"),
    ]);

  const byId = new Map((schedules ?? []).map((s) => [s.id as string, s]));
  const pins = new Map((logs ?? []).map((l) => [l.date as string, l.schedule_id as string]));
  const notes = new Map((overrides ?? []).map((o) => [o.date as string, o.note as string | null]));

  const days: CalendarDay[] = [];
  for (let d = 1; d <= Number(last.slice(8)); d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const pinRow = pins.get(date) ? byId.get(pins.get(date)!) : undefined;
    const r = resolve(employeeId, date, pinRow ?? null);
    const named = r.sched.id ? byId.get(r.sched.id) : undefined;
    days.push({
      date,
      restDay: r.restDay,
      source: r.source,
      schedule_id: named ? (named.id as string) : null,
      schedule_name: (named?.name as string | undefined) ?? null,
      time_in: r.sched.time_in.slice(0, 5),
      time_out: r.sched.time_out.slice(0, 5),
      break_start: r.sched.break_start?.slice(0, 5) ?? null,
      break_end: r.sched.break_end?.slice(0, 5) ?? null,
      override_note: notes.get(date) ?? null,
    });
  }
  return { days };
}

/** Sets one employee's schedule for one date: a schedule, or a rest day. */
export async function setScheduleOverride(input: {
  employeeId: string;
  date: string;
  scheduleId: string | null;
  isRestDay: boolean;
  note?: string | null;
}): Promise<{ resort: ResortSummary }> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("You do not have permission to set schedules.");
  if (!DATE_RE.test(input.date)) throw new Error("Invalid date");
  if (!input.isRestDay && !input.scheduleId) throw new Error("Choose a schedule or mark the day as a rest day.");
  const supabase = createAdminClient();
  await requireScope(supabase, user, [input.employeeId]);

  const { error } = await supabase
    .schema("hris")
    .from("schedule_overrides")
    .upsert(
      {
        employee_id: input.employeeId,
        date: input.date,
        schedule_id: input.isRestDay ? null : input.scheduleId,
        is_rest_day: input.isRestDay,
        note: input.note?.trim() || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,date" },
    );
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "set_schedule_override",
    tableName: "schedule_overrides",
    newValues: input,
  });
  // The day itself and the morning after (a night shift's clock-out).
  const resort = await resortAfterChange(supabase, [input.employeeId], input.date, input.date);
  revalidatePath("/admin/schedules");
  return { resort };
}

export async function clearScheduleOverride(
  employeeId: string,
  date: string,
): Promise<{ resort: ResortSummary }> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("You do not have permission to set schedules.");
  const supabase = createAdminClient();
  await requireScope(supabase, user, [employeeId]);
  const { error } = await supabase
    .schema("hris")
    .from("schedule_overrides")
    .delete()
    .eq("employee_id", employeeId)
    .eq("date", date);
  if (error) throw error;
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "clear_schedule_override",
    tableName: "schedule_overrides",
    newValues: { employeeId, date },
  });
  const resort = await resortAfterChange(supabase, [employeeId], date, date);
  revalidatePath("/admin/schedules");
  return { resort };
}
