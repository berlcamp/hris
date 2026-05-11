"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import type { AuthUserData } from "@/lib/actions/auth-actions";
import { getSystemSettings } from "@/lib/actions/settings-actions";
import { NOSI_BASIS_SALARY_REASONS } from "@/lib/constants";

// --- Types ---

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  plantillaCount: number;
  joCount: number;
  cosCount: number;
  pendingLeaves: number;
  approvedLeaves: number;
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
  detail: string;
  created_at: string;
}

export interface UpcomingIncrementItem {
  employee_id: string;
  employee_name: string;
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

  const isDeptHead =
    (user.role === "department_head" || user.role === "department_admin") &&
    !!user.departmentId;
  const deptId = user.departmentId ?? null;

  // For department_head: pre-compute employee IDs in their dept so we can
  // scope record-counts (leaves/NOSI/NOSA/IPCR) to "their employees only".
  let deptEmployeeIds: string[] = [];
  if (isDeptHead && deptId) {
    const { data: deptEmps } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("department_id", deptId);
    deptEmployeeIds = (deptEmps ?? []).map((e) => e.id);
  }
  const noDeptEmployees = isDeptHead && deptEmployeeIds.length === 0;

  // Employee counts (filterable directly by department_id)
  let totalQuery = supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true });
  if (isDeptHead && deptId) totalQuery = totalQuery.eq("department_id", deptId);
  const { count: totalEmployees } = await totalQuery;

  let activeQuery = supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (isDeptHead && deptId) activeQuery = activeQuery.eq("department_id", deptId);
  const { count: activeEmployees } = await activeQuery;

  let plantillaQuery = supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "plantilla");
  if (isDeptHead && deptId) plantillaQuery = plantillaQuery.eq("department_id", deptId);
  const { count: plantillaCount } = await plantillaQuery;

  let joQuery = supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "jo");
  if (isDeptHead && deptId) joQuery = joQuery.eq("department_id", deptId);
  const { count: joCount } = await joQuery;

  let cosQuery = supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("employment_type", "cos");
  if (isDeptHead && deptId) cosQuery = cosQuery.eq("department_id", deptId);
  const { count: cosCount } = await cosQuery;

  // Pending approvals — for dept_head, scope by employee_id list
  let pendingLeaves = 0;
  let approvedLeaves = 0;
  let pendingNosi = 0;
  let pendingNosa = 0;
  let pendingIpcr = 0;

  if (!noDeptEmployees) {
    let leavesQuery = supabase
      .schema("hris")
      .from("leave_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (isDeptHead) leavesQuery = leavesQuery.in("employee_id", deptEmployeeIds);
    const { count } = await leavesQuery;
    pendingLeaves = count ?? 0;

    // Approved leaves for the current calendar year (start_date in this year)
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    let approvedQuery = supabase
      .schema("hris")
      .from("leave_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("start_date", yearStart)
      .lte("start_date", yearEnd);
    if (isDeptHead) approvedQuery = approvedQuery.in("employee_id", deptEmployeeIds);
    const { count: approvedCount } = await approvedQuery;
    approvedLeaves = approvedCount ?? 0;

    let nosiQuery = supabase
      .schema("hris")
      .from("nosi_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (isDeptHead) nosiQuery = nosiQuery.in("employee_id", deptEmployeeIds);
    const { count: nosiCount } = await nosiQuery;
    pendingNosi = nosiCount ?? 0;

    let nosaQuery = supabase
      .schema("hris")
      .from("nosa_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (isDeptHead) nosaQuery = nosaQuery.in("employee_id", deptEmployeeIds);
    const { count: nosaCount } = await nosaQuery;
    pendingNosa = nosaCount ?? 0;

    let ipcrQuery = supabase
      .schema("hris")
      .from("ipcr_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (isDeptHead) ipcrQuery = ipcrQuery.in("employee_id", deptEmployeeIds);
    const { count: ipcrCount } = await ipcrQuery;
    pendingIpcr = ipcrCount ?? 0;
  }

  let departmentCount = 0;
  if (isDeptHead) {
    departmentCount = 1;
  } else {
    const { count } = await supabase
      .schema("hris")
      .from("departments")
      .select("id", { count: "exact", head: true });
    departmentCount = count ?? 0;
  }

  return {
    totalEmployees: totalEmployees ?? 0,
    activeEmployees: activeEmployees ?? 0,
    plantillaCount: plantillaCount ?? 0,
    joCount: joCount ?? 0,
    cosCount: cosCount ?? 0,
    pendingLeaves,
    approvedLeaves,
    pendingNosi,
    pendingNosa,
    pendingIpcr,
    departmentCount,
  };
}

// --- Chart Data ---

export async function getEmployeesByDepartment(): Promise<DeptEmployeeCount[]> {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("employees")
    .select("department_id, departments!employees_department_id_fkey(name, code)")
    .eq("status", "active");

  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  }

  const { data } = await query;

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
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("employees")
    .select("employment_type")
    .eq("status", "active");

  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  }

  const { data } = await query;

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
    .select("id, created_at, days_applied, employees!inner(first_name, last_name, department_id), leave_types!inner(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (
    (user.role === "department_head" || user.role === "department_admin") &&
    user.departmentId
  ) {
    leaveQuery = leaveQuery.eq("employees.department_id", user.departmentId);
  }

  const { data: leaves } = await leaveQuery;
  for (const l of leaves ?? []) {
    const emp = l.employees as unknown as { first_name: string; last_name: string } | null;
    const lt = l.leave_types as unknown as { name: string } | null;
    if (!emp) continue;
    items.push({
      id: l.id,
      type: "leave",
      employee_name: `${emp.last_name}, ${emp.first_name}`,
      detail: `${lt?.name ?? "Leave"} — ${l.days_applied} day(s)`,
      created_at: l.created_at,
    });
  }

  if (["super_admin", "hr_admin"].includes(user.role)) {
    // Pending NOSI
    const { data: nosis } = await supabase
      .schema("hris")
      .from("nosi_records")
      .select("id, created_at, current_step, new_step, employees!inner(first_name, last_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    for (const n of nosis ?? []) {
      const emp = n.employees as unknown as { first_name: string; last_name: string } | null;
      if (!emp) continue;
      items.push({
        id: n.id,
        type: "nosi",
        employee_name: `${emp.last_name}, ${emp.first_name}`,
        detail: `Step ${n.current_step} → ${n.new_step}`,
        created_at: n.created_at,
      });
    }

    // Pending NOSA
    const { data: nosas } = await supabase
      .schema("hris")
      .from("nosa_records")
      .select("id, created_at, reason, employees!inner(first_name, last_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    for (const n of nosas ?? []) {
      const emp = n.employees as unknown as { first_name: string; last_name: string } | null;
      if (!emp) continue;
      items.push({
        id: n.id,
        type: "nosa",
        employee_name: `${emp.last_name}, ${emp.first_name}`,
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

  // Leave balances (used/balance derived from approved applications via the view)
  const { data: credits } = await supabase
    .schema("hris")
    .from("leave_credit_balances")
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

  // Next step increment (aligned with NOSI basis: salary history + system setting years)
  let nextIncrementDate: string | null = null;
  if (emp.step_increment < 8) {
    const { nosi_eligibility_years: nosiYears } = await getSystemSettings();
    const { data: lastIncrement } = await supabase
      .schema("hris")
      .from("salary_history")
      .select("effective_date")
      .eq("employee_id", emp.id)
      .in("reason", [...NOSI_BASIS_SALARY_REASONS])
      .order("effective_date", { ascending: false })
      .limit(1);

    if (lastIncrement && lastIncrement.length > 0) {
      const lastDate = new Date(lastIncrement[0].effective_date);
      lastDate.setFullYear(lastDate.getFullYear() + nosiYears);
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
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("positions")
    .select(`
      id, title, item_number, salary_grade, is_filled,
      departments!positions_department_id_fkey(name, code),
      employees!employees_position_id_fkey(id, first_name, last_name, status)
    `)
    .order("salary_grade", { ascending: false });

  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getReportNosiSummary(startDate?: string, endDate?: string) {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosi_records")
    .select(`
      id, effective_date, current_salary_grade, current_step, new_step,
      current_salary, new_salary, status,
      employees!inner(first_name, last_name, department_id,
        departments!employees_department_id_fkey(name))
    `)
    .order("effective_date", { ascending: false });

  if (startDate) query = query.gte("effective_date", startDate);
  if (endDate) query = query.lte("effective_date", endDate);
  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("employees.department_id", user.departmentId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getReportNosaSummary(startDate?: string, endDate?: string) {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("nosa_records")
    .select(`
      id, effective_date, previous_salary_grade, previous_step, new_salary_grade, new_step,
      previous_salary, new_salary, reason, status,
      employees!inner(first_name, last_name, department_id,
        departments!employees_department_id_fkey(name))
    `)
    .order("effective_date", { ascending: false });

  if (startDate) query = query.gte("effective_date", startDate);
  if (endDate) query = query.lte("effective_date", endDate);
  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("employees.department_id", user.departmentId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getReportIpcrSummary(periodId?: string) {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("ipcr_records")
    .select(`
      id, numerical_rating, adjectival_rating, status,
      employees!inner(first_name, last_name, department_id,
        departments!employees_department_id_fkey(name)),
      ipcr_periods!inner(name)
    `)
    .order("numerical_rating", { ascending: false });

  if (periodId) query = query.eq("period_id", periodId);
  if (user?.role === "department_head" && user.departmentId) {
    query = query.eq("employees.department_id", user.departmentId);
  }

  const { data } = await query;
  return data ?? [];
}
