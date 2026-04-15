"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";

// --- Types ---

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  plantillaCount: number;
  joCount: number;
  cosCount: number;
  pendingLeaves: number;
  pendingNosi: number;
  pendingNosa: number;
  pendingIpcr: number;
  departmentCount: number;
}

export interface DeptEmployeeCount {
  department: string;
  code: string;
  count: number;
}

export interface EmployeeTypeCount {
  type: string;
  count: number;
}

export interface PendingApprovalItem {
  id: string;
  type: "leave" | "nosi" | "nosa";
  employee_name: string;
  employee_no: string;
  detail: string;
  created_at: string;
}

export interface UpcomingIncrementItem {
  employee_id: string;
  employee_name: string;
  employee_no: string;
  department: string;
  current_step: number;
  salary_grade: number;
  last_increment_date: string;
  eligible_date: string;
}

export interface LeaveBalanceItem {
  leave_type: string;
  code: string;
  total: number;
  used: number;
  balance: number;
}

export interface EmployeeDashboardData {
  leaveBalances: LeaveBalanceItem[];
  pendingApplications: { id: string; type: string; detail: string; status: string; created_at: string }[];
  nextIncrementDate: string | null;
  latestIpcr: { rating: number | null; adjectival: string | null; period: string } | null;
}

// --- Dashboard Stats ---

export async function getDashboardStats(user: AuthUserData): Promise<DashboardStats> {
  const supabase = createAdminClient();

  // Employee counts
  const { count: totalEmployees } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true });

  const { count: activeEmployees } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: plantillaCount } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "plantilla");

  const { count: joCount } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "jo");

  const { count: cosCount } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "cos");

  // Pending approvals
  let pendingLeavesQuery = supabase
    .schema("hris")
    .from("leave_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (user.role === "department_head" && user.departmentId) {
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", user.departmentId);
    if (deptEmps && deptEmps.length > 0) {
      pendingLeavesQuery = pendingLeavesQuery.in("employee_id", deptEmps.map((e) => e.id));
    }
  }

  const { count: pendingLeaves } = await pendingLeavesQuery;

  const { count: pendingNosi } = await supabase
    .schema("hris")
    .from("nosi_records")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: pendingNosa } = await supabase
    .schema("hris")
    .from("nosa_records")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: pendingIpcr } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: departmentCount } = await supabase
    .schema("hris")
    .from("departments")
    .select("id", { count: "exact", head: true });

  return {
    totalEmployees: totalEmployees ?? 0,
    activeEmployees: activeEmployees ?? 0,
    plantillaCount: plantillaCount ?? 0,
    joCount: joCount ?? 0,
    cosCount: cosCount ?? 0,
    pendingLeaves: pendingLeaves ?? 0,
    pendingNosi: pendingNosi ?? 0,
    pendingNosa: pendingNosa ?? 0,
    pendingIpcr: pendingIpcr ?? 0,
    departmentCount: departmentCount ?? 0,
  };
}

// --- Chart Data ---

export async function getEmployeesByDepartment(): Promise<DeptEmployeeCount[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select("department_id, departments!employees_department_id_fkey(name, code)")
    .eq("status", "active");

  if (!data) return [];

  const countMap = new Map<string, { name: string; code: string; count: number }>();
  for (const emp of data) {
    const dept = emp.departments as unknown as { name: string; code: string } | null;
    const key = dept?.code ?? "NONE";
    if (!countMap.has(key)) {
      countMap.set(key, { name: dept?.name ?? "Unassigned", code: key, count: 0 });
    }
    countMap.get(key)!.count++;
  }

  return [...countMap.values()]
    .map((d) => ({ department: d.name, code: d.code, count: d.count }))
    .sort((a, b) => b.count - a.count);
}

export async function getEmployeesByType(): Promise<EmployeeTypeCount[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .schema("hris")
    .from("employees")
    .select("employment_type")
    .eq("status", "active");

  if (!data) return [];

  const countMap = new Map<string, number>();
  for (const emp of data) {
    const t = emp.employment_type;
    countMap.set(t, (countMap.get(t) ?? 0) + 1);
  }

  const labels: Record<string, string> = {
    plantilla: "Plantilla",
    jo: "Job Order",
    cos: "Contract of Service",
  };

  return [...countMap.entries()].map(([type, count]) => ({
    type: labels[type] ?? type,
    count,
  }));
}

// --- Pending Approvals ---

export async function getPendingApprovals(user: AuthUserData): Promise<PendingApprovalItem[]> {
  const supabase = createAdminClient();
  const items: PendingApprovalItem[] = [];

  // Pending leaves
  let leaveQuery = supabase
    .schema("hris")
    .from("leave_applications")
    .select("id, created_at, days_applied, employees!inner(first_name, last_name, employee_no, department_id), leave_types!inner(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (user.role === "department_head" && user.departmentId) {
    leaveQuery = leaveQuery.eq("employees.department_id", user.departmentId);
  }

  const { data: leaves } = await leaveQuery;
  for (const l of leaves ?? []) {
    const emp = l.employees as unknown as { first_name: string; last_name: string; employee_no: string } | null;
    const lt = l.leave_types as unknown as { name: string } | null;
    if (!emp) continue;
    items.push({
      id: l.id,
      type: "leave",
      employee_name: `${emp.last_name}, ${emp.first_name}`,
      employee_no: emp.employee_no,
      detail: `${lt?.name ?? "Leave"} — ${l.days_applied} day(s)`,
      created_at: l.created_at,
    });
  }

  if (["super_admin", "hr_admin"].includes(user.role)) {
    // Pending NOSI
    const { data: nosis } = await supabase
      .schema("hris")
      .from("nosi_records")
      .select("id, created_at, current_step, new_step, employees!inner(first_name, last_name, employee_no)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    for (const n of nosis ?? []) {
      const emp = n.employees as unknown as { first_name: string; last_name: string; employee_no: string } | null;
      if (!emp) continue;
      items.push({
        id: n.id,
        type: "nosi",
        employee_name: `${emp.last_name}, ${emp.first_name}`,
        employee_no: emp.employee_no,
        detail: `Step ${n.current_step} → ${n.new_step}`,
        created_at: n.created_at,
      });
    }

    // Pending NOSA
    const { data: nosas } = await supabase
      .schema("hris")
      .from("nosa_records")
      .select("id, created_at, reason, employees!inner(first_name, last_name, employee_no)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    for (const n of nosas ?? []) {
      const emp = n.employees as unknown as { first_name: string; last_name: string; employee_no: string } | null;
      if (!emp) continue;
      items.push({
        id: n.id,
        type: "nosa",
        employee_name: `${emp.last_name}, ${emp.first_name}`,
        employee_no: emp.employee_no,
        detail: (n.reason as string).replace(/_/g, " "),
        created_at: n.created_at,
      });
    }
  }

  return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// --- Employee-specific dashboard ---

export async function getEmployeeDashboardData(userId: string): Promise<EmployeeDashboardData | null> {
  const supabase = createAdminClient();

  // Find employee record
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, salary_grade, step_increment")
    .eq("user_profile_id", userId)
    .maybeSingle();

  if (!emp) return null;

  const currentYear = new Date().getFullYear();

  // Leave balances
  const { data: credits } = await supabase
    .schema("hris")
    .from("leave_credits")
    .select("total_credits, used_credits, balance, leave_types!inner(name, code)")
    .eq("employee_id", emp.id)
    .eq("year", currentYear);

  const leaveBalances: LeaveBalanceItem[] = (credits ?? []).map((c) => {
    const lt = c.leave_types as unknown as { name: string; code: string };
    return {
      leave_type: lt.name,
      code: lt.code,
      total: c.total_credits,
      used: c.used_credits,
      balance: c.balance,
    };
  });

  // Pending leave applications
  const { data: pendingLeaves } = await supabase
    .schema("hris")
    .from("leave_applications")
    .select("id, status, created_at, days_applied, leave_types!inner(name)")
    .eq("employee_id", emp.id)
    .in("status", ["pending", "draft"])
    .order("created_at", { ascending: false })
    .limit(5);

  const pendingApplications = (pendingLeaves ?? []).map((l) => {
    const lt = l.leave_types as unknown as { name: string };
    return {
      id: l.id,
      type: "leave",
      detail: `${lt.name} — ${l.days_applied} day(s)`,
      status: l.status as string,
      created_at: l.created_at as string,
    };
  });

  // Next step increment
  let nextIncrementDate: string | null = null;
  if (emp.step_increment < 8) {
    const { data: lastIncrement } = await supabase
      .schema("hris")
      .from("salary_history")
      .select("effective_date")
      .eq("employee_id", emp.id)
      .in("reason", ["step_increment", "initial"])
      .order("effective_date", { ascending: false })
      .limit(1);

    if (lastIncrement && lastIncrement.length > 0) {
      const lastDate = new Date(lastIncrement[0].effective_date);
      lastDate.setFullYear(lastDate.getFullYear() + 3);
      nextIncrementDate = lastDate.toISOString().split("T")[0];
    }
  }

  // Latest IPCR
  const { data: latestIpcr } = await supabase
    .schema("hris")
    .from("ipcr_records")
    .select("numerical_rating, adjectival_rating, ipcr_periods!inner(name)")
    .eq("employee_id", emp.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);

  let latestIpcrData: EmployeeDashboardData["latestIpcr"] = null;
  if (latestIpcr && latestIpcr.length > 0) {
    const r = latestIpcr[0];
    const period = r.ipcr_periods as unknown as { name: string };
    latestIpcrData = {
      rating: r.numerical_rating,
      adjectival: r.adjectival_rating,
      period: period.name,
    };
  }

  return {
    leaveBalances,
    pendingApplications,
    nextIncrementDate,
    latestIpcr: latestIpcrData,
  };
}

// --- Reports helpers ---

export async function getReportPlantilla() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .schema("hris")
    .from("positions")
    .select(`
      id, title, item_number, salary_grade, is_filled,
      departments!positions_department_id_fkey(name, code),
      employees!employees_position_id_fkey(id, first_name, last_name, employee_no, status)
    `)
    .order("salary_grade", { ascending: false });

  return data ?? [];
}

export async function getReportNosiSummary(startDate?: string, endDate?: string) {
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosi_records")
    .select(`
      id, effective_date, current_salary_grade, current_step, new_step,
      current_salary, new_salary, status,
      employees!inner(employee_no, first_name, last_name,
        departments!employees_department_id_fkey(name))
    `)
    .order("effective_date", { ascending: false });

  if (startDate) query = query.gte("effective_date", startDate);
  if (endDate) query = query.lte("effective_date", endDate);

  const { data } = await query;
  return data ?? [];
}

export async function getReportNosaSummary(startDate?: string, endDate?: string) {
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosa_records")
    .select(`
      id, effective_date, previous_salary_grade, previous_step, new_salary_grade, new_step,
      previous_salary, new_salary, reason, status,
      employees!inner(employee_no, first_name, last_name,
        departments!employees_department_id_fkey(name))
    `)
    .order("effective_date", { ascending: false });

  if (startDate) query = query.gte("effective_date", startDate);
  if (endDate) query = query.lte("effective_date", endDate);

  const { data } = await query;
  return data ?? [];
}

export async function getReportIpcrSummary(periodId?: string) {
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("ipcr_records")
    .select(`
      id, numerical_rating, adjectival_rating, status,
      employees!inner(employee_no, first_name, last_name,
        departments!employees_department_id_fkey(name)),
      ipcr_periods!inner(name)
    `)
    .order("numerical_rating", { ascending: false });

  if (periodId) query = query.eq("period_id", periodId);

  const { data } = await query;
  return data ?? [];
}
