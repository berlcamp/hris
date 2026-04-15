import { createAdminClient } from "@/lib/supabase/admin";

interface AuditLogInput {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  tableName?: string;
  recordId?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    const supabase = createAdminClient();

    await supabase.schema("hris").from("audit_log").insert({
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      action: input.action,
      table_name: input.tableName ?? null,
      record_id: input.recordId ?? null,
      old_values: input.oldValues ?? null,
      new_values: input.newValues ?? null,
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("Audit log failed:", err);
  }
}
