"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getLeaveApplicationById } from "@/lib/actions/leave-actions";

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_profiles: { full_name: string } | null;
}

export async function getAuditLogs(filters?: {
  action?: string;
  tableName?: string;
  userEmail?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AuditLogRow[]> {
  const user = await getCurrentUser();
  if (!user || !["super_admin"].includes(user.role)) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("audit_log")
    .select("*, user_profiles:user_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.action) {
    query = query.eq("action", filters.action);
  }
  if (filters?.tableName) {
    query = query.eq("table_name", filters.tableName);
  }
  if (filters?.userEmail) {
    query = query.ilike("user_email", `%${filters.userEmail}%`);
  }
  if (filters?.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte("created_at", filters.endDate + "T23:59:59");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogRow[];
}

/**
 * Audit trail for a single leave application — visible to anyone who can
 * already view the leave (employee owner, dept head/admin of the employee's
 * dept, hr_admin once dept-approved, or super_admin). Permission is enforced
 * by piggy-backing on getLeaveApplicationById, which throws otherwise.
 */
export async function getLeaveAuditTrail(leaveId: string): Promise<AuditLogRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Permission check — throws on unauthorized / not found
  try {
    await getLeaveApplicationById(leaveId);
  } catch {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("audit_log")
    .select("*, user_profiles:user_id(full_name)")
    .eq("table_name", "leave_applications")
    .eq("record_id", leaveId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AuditLogRow[];
}
