"use server";

// The officer's review list of unsettled days (blank DTR cells still to
// settle) for one department and month, with the raw punches behind each day.
//
// Reach mirrors corrections: the direct-apply roles (super admin / HR / DTR
// manager) choose any department; a department admin sees the department they
// file corrections for (detailed-to, else home). The DTR builder computes the
// days, so the list shows exactly what the printed DTR will.

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  canDirectApplyAttendanceCorrection,
  canRequestAttendanceCorrection,
} from "@/lib/auth-helpers";
import { buildDtrResults, loadDtrEmployeesForDepartment } from "@/lib/dtr-builder";
import { manilaToday } from "@/lib/format-date";
import { selectAll } from "@/lib/postgrest-paging";
import { loadScheduleContext } from "@/lib/schedule-context";
import { dutyDateForPunch } from "@/lib/schedule-resolver";
import {
  buildReviewItems,
  type ReviewPunch,
  type UnsettledItem,
} from "@/lib/unsettled-review";

const EMPLOYEE_CHUNK = 50;

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export async function getUnsettledReview(input: {
  month: string;
  departmentId: string | null;
}): Promise<{ items: UnsettledItem[]; employeeCount: number }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const direct = canDirectApplyAttendanceCorrection(user.roles);
  if (!direct && (!canRequestAttendanceCorrection(user) || !user.departmentId)) {
    throw new Error("Unauthorized");
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("Invalid month");
  const departmentId = direct ? input.departmentId : user.departmentId;
  if (!departmentId) return { items: [], employeeCount: 0 };

  const [y, m] = input.month.split("-").map(Number) as [number, number];
  const from = `${input.month}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = manilaToday();
  // Days that have not happened yet cannot be unsettled.
  const to = monthEnd < today ? monthEnd : today;
  if (to < from) return { items: [], employeeCount: 0 };

  const supabase = createAdminClient();
  const employees = await loadDtrEmployeesForDepartment(supabase, departmentId);
  if (employees.length === 0) return { items: [], employeeCount: 0 };

  const results = await buildDtrResults(supabase, employees, from, to);
  const withBlanks = new Set(
    results
      .filter((r) => r.entries.some((e) => (e.unsettled_slots?.length ?? 0) > 0))
      .map((r) => r.employee.id),
  );

  // The punches behind each unsettled day, assigned to duty days the same way
  // the importer's re-sort does.
  const punchesByKey = new Map<string, ReviewPunch[]>();
  const ids = [...withBlanks];
  if (ids.length > 0) {
    const resolve = await loadScheduleContext(supabase, ids, addDaysIso(from, -1), addDaysIso(to, 1));
    for (let i = 0; i < ids.length; i += EMPLOYEE_CHUNK) {
      const chunk = ids.slice(i, i + EMPLOYEE_CHUNK);
      const rows = await selectAll<{
        employee_id: string;
        punch_date: string;
        punch_time: string;
        device_status: string;
        biometric_devices: { name: string } | null;
      }>((a, b) =>
        supabase
          .schema("hris")
          .from("attendance_punches")
          .select("employee_id, punch_date, punch_time, device_status, biometric_devices(name)")
          .in("employee_id", chunk)
          .gte("punch_date", from)
          .lte("punch_date", addDaysIso(to, 1))
          .order("id")
          .range(a, b),
      );
      for (const p of rows) {
        const duty = dutyDateForPunch(
          p.punch_date,
          p.punch_time,
          resolve(p.employee_id, addDaysIso(p.punch_date, -1)),
        );
        const key = `${p.employee_id}_${duty}`;
        if (!punchesByKey.has(key)) punchesByKey.set(key, []);
        punchesByKey.get(key)!.push({
          date: p.punch_date,
          time: p.punch_time,
          device: p.biometric_devices?.name ?? null,
          status: p.device_status,
        });
      }
    }
  }

  return { items: buildReviewItems(results, punchesByKey), employeeCount: employees.length };
}
