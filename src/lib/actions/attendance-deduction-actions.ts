"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";

// Fires the SQL helper that posts a delta row for one employee + month,
// using the same math the DTR/Report display uses. Idempotent: running
// twice without changes is a no-op since the delta becomes 0.
//
// Swallows errors so a failed deduction never breaks the calling attendance
// write — same pattern as logAudit().
export async function recomputeAttendanceDeductionFor(
  employeeId: string,
  year: number,
  month: number,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.schema("hris").rpc("apply_attendance_vl_deduction", {
      p_year: year,
      p_month: month,
      p_employee_id: employeeId,
    });
  } catch {
    // intentionally silent
  }
}

// Recomputes for a batch of distinct (employee_id, year, month) tuples.
// Used by the Dahua importer after a batch write.
export async function recomputeAttendanceDeductionsBatch(
  tuples: { employeeId: string; year: number; month: number }[],
): Promise<void> {
  // Deduplicate to avoid redundant RPC calls.
  const seen = new Set<string>();
  const unique: { employeeId: string; year: number; month: number }[] = [];
  for (const t of tuples) {
    const k = `${t.employeeId}|${t.year}|${t.month}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(t);
  }
  await Promise.all(
    unique.map((t) =>
      recomputeAttendanceDeductionFor(t.employeeId, t.year, t.month),
    ),
  );
}

// Admin-triggered: post (or update via deltas) VL deductions for every
// plantilla active that has attendance_logs in the given month. Idempotent —
// re-running posts only the difference vs. what's already in the ledger.
export async function postMonthlyAttendanceDeductions(
  year: number,
  month: number,
): Promise<{
  employees: number;
  posts: number;
  totalDays: number;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { employees: 0, posts: 0, totalDays: 0, error: "Unauthorized" };
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return { employees: 0, posts: 0, totalDays: 0, error: "Invalid year" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { employees: 0, posts: 0, totalDays: 0, error: "Invalid month" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .rpc("apply_attendance_vl_deduction", {
      p_year: year,
      p_month: month,
      p_employee_id: null,
    });

  if (error) {
    return { employees: 0, posts: 0, totalDays: 0, error: error.message };
  }

  // RPC returns a single-row table.
  const row = Array.isArray(data) ? data[0] : data;
  const employees = Number((row as { employees_v?: number } | null)?.employees_v ?? 0);
  const posts = Number((row as { posts_v?: number } | null)?.posts_v ?? 0);
  const totalDays = Number((row as { total_days?: number } | null)?.total_days ?? 0);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "post_attendance_deductions",
    tableName: "leave_credit_accruals",
    newValues: { year, month, employees, posts, totalDays },
  });

  revalidatePath("/reports/attendance-deductions");
  revalidatePath("/leaves/credits");
  return { employees, posts, totalDays };
}

export interface AttendanceDeductionPreviewRow {
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  total_minutes: number;
  required_days: number;       // negative; what the ledger SHOULD total
  already_posted_days: number; // sum of existing entries (≤ 0)
  delta_days: number;          // what posting will insert; 0 means no change
}

export interface AttendanceDeductionPreview {
  rows: AttendanceDeductionPreviewRow[];
  summary: {
    candidates: number;
    changing: number;
    unchanged: number;
    deltaDaysTotal: number;
  };
}

export async function previewMonthlyAttendanceDeductions(
  year: number,
  month: number,
  departmentId: string | null,
): Promise<AttendanceDeductionPreview> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid year/month");
  }

  const supabase = createAdminClient();

  const { data: previewRpc, error } = await supabase
    .schema("hris")
    .rpc("preview_attendance_vl_deduction", {
      p_year: year,
      p_month: month,
      p_employee_id: null,
    });
  if (error) throw new Error(error.message);

  const previewRows = (previewRpc ?? []) as unknown as {
    employee_id: string;
    total_minutes: number;
    required_days: number;
    already_posted_days: number;
    delta_days: number;
  }[];

  if (previewRows.length === 0) {
    return {
      rows: [],
      summary: { candidates: 0, changing: 0, unchanged: 0, deltaDaysTotal: 0 },
    };
  }

  // Join with employees + department for display.
  const ids = previewRows.map((r) => r.employee_id);
  const { data: empRows } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, department_id, departments!employees_department_id_fkey(name)",
    )
    .in("id", ids);
  const empMap = new Map(
    (empRows ?? []).map((e) => [
      e.id as string,
      e as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        department_id: string | null;
        departments: { name: string } | null;
      },
    ]),
  );

  const rows: AttendanceDeductionPreviewRow[] = [];
  let changing = 0;
  let deltaTotal = 0;
  for (const r of previewRows) {
    const emp = empMap.get(r.employee_id);
    if (!emp) continue;
    if (departmentId && (emp.department_id ?? null) !== departmentId) continue;
    const deltaDays = Number(r.delta_days);
    if (deltaDays !== 0) {
      changing += 1;
      deltaTotal += deltaDays;
    }
    rows.push({
      employee_id: r.employee_id,
      employee_name: `${emp.last_name}, ${emp.first_name}`,
      department_name: emp.departments?.name ?? null,
      total_minutes: Number(r.total_minutes),
      required_days: Number(r.required_days),
      already_posted_days: Number(r.already_posted_days),
      delta_days: deltaDays,
    });
  }

  // Sort: changing rows first (largest deduction first), then unchanged.
  rows.sort((a, b) => {
    const aCh = a.delta_days !== 0 ? 0 : 1;
    const bCh = b.delta_days !== 0 ? 0 : 1;
    if (aCh !== bCh) return aCh - bCh;
    if (a.delta_days !== b.delta_days) return a.delta_days - b.delta_days; // most negative first
    return a.employee_name.localeCompare(b.employee_name);
  });

  return {
    rows,
    summary: {
      candidates: rows.length,
      changing,
      unchanged: rows.length - changing,
      deltaDaysTotal: Number(deltaTotal.toFixed(3)),
    },
  };
}

export interface AttendanceDeductionRow {
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  net_days: number;          // sum of attendance_deduction amounts for the month (negative for net deduction)
  net_minutes: number;       // implied minutes: -net_days * 480
  post_count: number;        // number of ledger rows (original + corrections)
  first_posted_at: string;
  last_posted_at: string;
}

export async function getAttendanceDeductionsReport(
  year: number,
  month: number,
  departmentId: string | null,
): Promise<AttendanceDeductionRow[]> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select(
      "employee_id, amount, created_at, employees!leave_credit_accruals_employee_id_fkey(first_name, last_name, department_id, departments!employees_department_id_fkey(name))",
    )
    .eq("year", year)
    .eq("month", month)
    .eq("source", "attendance_deduction")
    .order("created_at", { ascending: true });

  const aggregated = new Map<string, AttendanceDeductionRow>();
  for (const r of (rows ?? []) as unknown as {
    employee_id: string;
    amount: number;
    created_at: string;
    employees: {
      first_name: string;
      last_name: string;
      department_id: string | null;
      departments: { name: string } | null;
    } | null;
  }[]) {
    // Department filter (post-load since we joined the relation).
    if (
      departmentId &&
      (r.employees?.department_id ?? null) !== departmentId
    ) {
      continue;
    }
    const existing = aggregated.get(r.employee_id);
    if (existing) {
      existing.net_days = Number((existing.net_days + Number(r.amount)).toFixed(3));
      existing.post_count += 1;
      existing.last_posted_at = r.created_at;
    } else {
      const emp = r.employees;
      aggregated.set(r.employee_id, {
        employee_id: r.employee_id,
        employee_name: emp ? `${emp.last_name}, ${emp.first_name}` : "—",
        department_name: emp?.departments?.name ?? null,
        net_days: Number(Number(r.amount).toFixed(3)),
        net_minutes: 0,
        post_count: 1,
        first_posted_at: r.created_at,
        last_posted_at: r.created_at,
      });
    }
  }

  // Implied minutes: ledger amount is in days at 0.125/hr, so 1 day = 480 min.
  for (const v of aggregated.values()) {
    v.net_minutes = Math.round(-v.net_days * 480);
  }

  return [...aggregated.values()].sort((a, b) =>
    a.employee_name.localeCompare(b.employee_name),
  );
}

// HR-triggered reversal: posts a single positive 'adjustment' row that
// cancels the net effect of the month's 'attendance_deduction' rows for
// one employee. The original attendance_deduction rows are preserved so
// the audit trail stays intact; future Preview/Post runs see the
// attendance_deduction sum unchanged and post 0 delta — i.e. the reversal
// sticks unless attendance is re-edited.
export async function reverseAttendanceDeductionForMonth(
  employeeId: string,
  year: number,
  month: number,
  reason?: string,
): Promise<{ offset: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !["super_admin", "hr_admin"].includes(user.role)) {
    return { offset: 0, error: "Unauthorized" };
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { offset: 0, error: "Invalid year/month" };
  }

  const supabase = createAdminClient();

  // Resolve VL leave type id.
  const { data: vl } = await supabase
    .schema("hris")
    .from("leave_types")
    .select("id")
    .eq("code", "VL")
    .maybeSingle();
  if (!vl) return { offset: 0, error: "VL leave type not configured" };

  // Sum existing attendance_deduction rows for this (emp, year, month).
  const { data: existing, error: sumErr } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .select("amount")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", vl.id)
    .eq("year", year)
    .eq("month", month)
    .eq("source", "attendance_deduction");
  if (sumErr) return { offset: 0, error: sumErr.message };

  const netDeduction = (existing ?? []).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );
  if (netDeduction === 0) {
    return { offset: 0, error: "Nothing to reverse for this month" };
  }

  // Posting the negative of the net deduction → cancels it out.
  const offset = Number((-1 * netDeduction).toFixed(3));

  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;
  const notes = reason
    ? `Reversal of attendance deduction for ${monthLabel}: ${reason}`
    : `Reversal of attendance deduction for ${monthLabel}`;

  const { error: insErr } = await supabase
    .schema("hris")
    .from("leave_credit_accruals")
    .insert({
      employee_id: employeeId,
      leave_type_id: vl.id,
      year,
      month,
      amount: offset,
      source: "adjustment",
      notes,
      created_by: user.id,
    });
  if (insErr) return { offset: 0, error: insErr.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "reverse_attendance_deduction",
    tableName: "leave_credit_accruals",
    recordId: employeeId,
    newValues: { year, month, offset, reason: reason ?? null },
  });

  revalidatePath("/reports/attendance-deductions");
  revalidatePath("/leaves/credits");
  return { offset };
}
