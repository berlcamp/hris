"use server";

// Rotations, rotation assignments and per-date schedule overrides (Phase 2,
// migration 094), and the calendar view of what they resolve to.
//
// Who may do what:
//   * rotation TEMPLATES are shared by the whole LGU: only schedule managers
//     (super admin / DTR manager) create, edit or delete them;
//   * assigning a rotation and setting a per-date override: schedule managers
//     for anyone, department admins for their own department's employees.
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

export interface RotationDayInput {
  week_no: number;
  iso_weekday: number;
  /** null = REST */
  schedule_id: string | null;
}

export interface RotationRow {
  id: string;
  name: string;
  cycle_weeks: number;
  notes: string | null;
  days: RotationDayInput[];
  /** Employees whose CURRENT assignment is this rotation. */
  assigned_count: number;
  /** Referenced by any assignment, past or present: its days are locked. */
  in_use: boolean;
}

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

function requireRotationManager(user: CurrentUser) {
  if (!canManageSchedules(user.roles)) {
    throw new Error("Only a super admin or DTR manager can change rotation templates.");
  }
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

// --- Rotation templates -------------------------------------------------

export async function getScheduleRotations(): Promise<RotationRow[]> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  const [rot, days, asg] = await Promise.all([
    supabase.schema("hris").from("schedule_rotations").select("id, name, cycle_weeks, notes").order("name"),
    supabase
      .schema("hris")
      .from("schedule_rotation_days")
      .select("rotation_id, week_no, iso_weekday, schedule_id"),
    supabase
      .schema("hris")
      .from("employee_rotation_assignments")
      .select("employee_id, rotation_id, effective_from"),
  ]);
  if (rot.error) throw rot.error;
  if (days.error) throw days.error;
  if (asg.error) throw asg.error;

  // The assignment in effect today, per employee.
  const today = manilaToday();
  const current = new Map<string, { rotation_id: string | null; effective_from: string }>();
  const used = new Set<string>();
  for (const a of asg.data ?? []) {
    if (a.rotation_id) used.add(a.rotation_id);
    if (a.effective_from > today) continue;
    const prev = current.get(a.employee_id);
    if (!prev || a.effective_from > prev.effective_from) current.set(a.employee_id, a);
  }
  const counts = new Map<string, number>();
  for (const a of current.values()) {
    if (a.rotation_id) counts.set(a.rotation_id, (counts.get(a.rotation_id) ?? 0) + 1);
  }

  return (rot.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    cycle_weeks: r.cycle_weeks,
    notes: r.notes,
    days: (days.data ?? [])
      .filter((d) => d.rotation_id === r.id)
      .map((d) => ({ week_no: d.week_no, iso_weekday: d.iso_weekday, schedule_id: d.schedule_id })),
    assigned_count: counts.get(r.id) ?? 0,
    in_use: used.has(r.id),
  }));
}

export async function saveScheduleRotation(input: {
  id?: string;
  name: string;
  cycle_weeks: number;
  notes?: string | null;
  days: RotationDayInput[];
}): Promise<{ id: string }> {
  const user = await requireUser();
  requireRotationManager(user);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Give the rotation a name.");
  if (!Number.isInteger(input.cycle_weeks) || input.cycle_weeks < 1 || input.cycle_weeks > 4) {
    throw new Error("A rotation repeats every 1 to 4 weeks.");
  }
  const days = input.days.filter(
    (d) =>
      d.week_no >= 1 && d.week_no <= input.cycle_weeks && d.iso_weekday >= 1 && d.iso_weekday <= 7,
  );
  if (!days.some((d) => d.schedule_id)) {
    throw new Error("A rotation needs at least one working day.");
  }

  const supabase = createAdminClient();
  let id = input.id;
  if (id) {
    // Changing the days of a rotation that has been assigned would rewrite the
    // DTRs of every date it already covered. Its name and notes may change;
    // for different days, duplicate it and assign the copy from a date.
    const { data: existing, error } = await supabase
      .schema("hris")
      .from("schedule_rotations")
      .select("cycle_weeks")
      .eq("id", id)
      .single();
    if (error) throw error;
    const { count } = await supabase
      .schema("hris")
      .from("employee_rotation_assignments")
      .select("id", { count: "exact", head: true })
      .eq("rotation_id", id);
    const { data: oldDays } = await supabase
      .schema("hris")
      .from("schedule_rotation_days")
      .select("week_no, iso_weekday, schedule_id")
      .eq("rotation_id", id);
    const key = (d: RotationDayInput) => `${d.week_no}-${d.iso_weekday}-${d.schedule_id ?? "rest"}`;
    const changed =
      existing.cycle_weeks !== input.cycle_weeks ||
      [...(oldDays ?? [])].map(key).sort().join() !== [...days].map(key).sort().join();
    if ((count ?? 0) > 0 && changed) {
      throw new Error(
        "This rotation has been assigned, so its days are locked. Duplicate it, change the copy, and assign the copy from a date.",
      );
    }
    const { error: upErr } = await supabase
      .schema("hris")
      .from("schedule_rotations")
      .update({
        name,
        cycle_weeks: input.cycle_weeks,
        notes: input.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (upErr) throw upErr.code === "23505" ? new Error(`A rotation named “${name}” already exists.`) : upErr;
  } else {
    const { data, error } = await supabase
      .schema("hris")
      .from("schedule_rotations")
      .insert({ name, cycle_weeks: input.cycle_weeks, notes: input.notes?.trim() || null })
      .select("id")
      .single();
    if (error) throw error.code === "23505" ? new Error(`A rotation named “${name}” already exists.`) : error;
    id = data.id as string;
  }

  const { error: delErr } = await supabase
    .schema("hris")
    .from("schedule_rotation_days")
    .delete()
    .eq("rotation_id", id);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase
    .schema("hris")
    .from("schedule_rotation_days")
    .insert(days.map((d) => ({ ...d, rotation_id: id })));
  if (insErr) throw insErr;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: input.id ? "update_schedule_rotation" : "create_schedule_rotation",
    tableName: "schedule_rotations",
    recordId: id,
    newValues: { name, cycle_weeks: input.cycle_weeks, days },
  });
  revalidatePath("/admin/schedules");
  return { id: id! };
}

export async function deleteScheduleRotation(id: string): Promise<void> {
  const user = await requireUser();
  requireRotationManager(user);
  const supabase = createAdminClient();
  const { error } = await supabase.schema("hris").from("schedule_rotations").delete().eq("id", id);
  if (error) {
    throw error.code === "23503"
      ? new Error("This rotation has been assigned and cannot be deleted.")
      : error;
  }
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete_schedule_rotation",
    tableName: "schedule_rotations",
    recordId: id,
  });
  revalidatePath("/admin/schedules");
}

// --- Assignment -----------------------------------------------------------

export interface AssignableEmployee {
  id: string;
  name: string;
  biometric_no: number | null;
  department_id: string | null;
  department: string | null;
  base_schedule: string | null;
  /** The rotation in effect today, if any. */
  rotation: string | null;
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

  const ids = (data ?? []).map((e) => e.id as string);
  const today = manilaToday();
  const rotationName = new Map<string, string>();
  const currentRotation = new Map<string, { rotation_id: string | null; effective_from: string }>();
  if (ids.length > 0) {
    const [{ data: rots }, { data: asg }] = await Promise.all([
      supabase.schema("hris").from("schedule_rotations").select("id, name"),
      supabase
        .schema("hris")
        .from("employee_rotation_assignments")
        .select("employee_id, rotation_id, effective_from")
        .lte("effective_from", today),
    ]);
    for (const r of rots ?? []) rotationName.set(r.id, r.name);
    for (const a of asg ?? []) {
      const prev = currentRotation.get(a.employee_id);
      if (!prev || a.effective_from > prev.effective_from) currentRotation.set(a.employee_id, a);
    }
  }

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
    const rot = currentRotation.get(row.id)?.rotation_id;
    return {
      id: row.id,
      name: [row.last_name, row.first_name].filter(Boolean).join(", "),
      biometric_no: row.biometric_no,
      department_id: row.department_id,
      department: row.departments?.name ?? null,
      base_schedule: row.schedules?.name ?? null,
      rotation: rot ? rotationName.get(rot) ?? null : null,
    };
  });
}

/**
 * Puts employees on a rotation from `effectiveFrom` — or, with a null
 * rotation, back on their base schedule from that date. `startWeek` is the
 * week of the cycle that the effective date's week is.
 */
export async function assignScheduleRotation(input: {
  employeeIds: string[];
  rotationId: string | null;
  effectiveFrom: string;
  startWeek: number;
}): Promise<{ assigned: number; resort: ResortSummary }> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("You do not have permission to set schedules.");
  if (input.employeeIds.length === 0) throw new Error("Choose at least one employee.");
  if (!DATE_RE.test(input.effectiveFrom)) throw new Error("Choose the date the rotation starts.");
  const supabase = createAdminClient();
  await requireScope(supabase, user, input.employeeIds);

  let cycle = 1;
  if (input.rotationId) {
    const { data, error } = await supabase
      .schema("hris")
      .from("schedule_rotations")
      .select("cycle_weeks")
      .eq("id", input.rotationId)
      .single();
    if (error || !data) throw new Error("That rotation no longer exists.");
    cycle = data.cycle_weeks;
  }
  const startWeek = Math.min(Math.max(1, Math.trunc(input.startWeek) || 1), cycle);

  const { error } = await supabase
    .schema("hris")
    .from("employee_rotation_assignments")
    .upsert(
      input.employeeIds.map((employee_id) => ({
        employee_id,
        rotation_id: input.rotationId,
        effective_from: input.effectiveFrom,
        start_week: startWeek,
        created_by: user.id,
      })),
      { onConflict: "employee_id,effective_from" },
    );
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: input.rotationId ? "assign_schedule_rotation" : "end_schedule_rotation",
    tableName: "employee_rotation_assignments",
    newValues: { ...input, startWeek },
  });

  const resort = await resortAfterChange(supabase, input.employeeIds, input.effectiveFrom);
  revalidatePath("/admin/schedules");
  return { assigned: input.employeeIds.length, resort };
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
): Promise<{ days: CalendarDay[]; rotation: string | null }> {
  const user = await requireUser();
  if (!canSetSchedules(user)) throw new Error("Unauthorized");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  const supabase = createAdminClient();
  await requireScope(supabase, user, [employeeId]);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [resolve, { data: logs }, { data: overrides }, { data: schedules }, { data: asg }] =
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
      supabase
        .schema("hris")
        .from("employee_rotation_assignments")
        .select("rotation_id, effective_from, schedule_rotations(name)")
        .eq("employee_id", employeeId)
        .lte("effective_from", last)
        .order("effective_from", { ascending: false })
        .limit(1),
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
  const current = (asg ?? [])[0] as unknown as
    | { rotation_id: string | null; schedule_rotations: { name: string } | null }
    | undefined;
  return { days, rotation: current?.rotation_id ? current.schedule_rotations?.name ?? null : null };
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
