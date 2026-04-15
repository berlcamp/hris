"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

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
