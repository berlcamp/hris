"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_JOB_ORDER_SIGNATORIES,
  JOB_ORDER_SIGNATORY_KEYS,
  type JobOrderSignatories,
  type JobOrderSignatoryKey,
} from "@/lib/job-order-signatories";
import {
  jobOrderSignatoriesSchema,
  type JobOrderSignatoriesValues,
} from "@/lib/validations/job-order-signatory-schema";

function isSignatoryKey(key: string): key is JobOrderSignatoryKey {
  return (JOB_ORDER_SIGNATORY_KEYS as string[]).includes(key);
}

/**
 * The signatories every Job Order printable signs with. Any key without a row
 * keeps its built-in default, so a form never prints a blank signature line.
 * A read failure falls back to the defaults too: printing must not be blocked
 * by it, and the defaults are what the forms printed before this was editable.
 */
export async function getJobOrderSignatories(): Promise<JobOrderSignatories> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return DEFAULT_JOB_ORDER_SIGNATORIES;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_signatories")
    .select("key, name, position, office");

  if (error) {
    console.error("Failed to load job order signatories:", error.message);
    return DEFAULT_JOB_ORDER_SIGNATORIES;
  }

  const result: JobOrderSignatories = { ...DEFAULT_JOB_ORDER_SIGNATORIES };
  for (const row of data ?? []) {
    if (!isSignatoryKey(row.key)) continue;
    result[row.key] = {
      name: row.name,
      position: row.position,
      office: row.office,
    };
  }
  return result;
}

export async function updateJobOrderSignatories(
  input: JobOrderSignatoriesValues,
) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.roles)) return { error: "Unauthorized" };

  const parsed = jobOrderSignatoriesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Every signatory needs a name and a position" };
  }

  const previous = await getJobOrderSignatories();

  const rows = JOB_ORDER_SIGNATORY_KEYS.map((key) => {
    const s = parsed.data[key];
    return {
      key,
      name: s.name,
      position: s.position,
      office: s.office.length === 0 ? null : s.office,
      updated_by: user!.id,
    };
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("job_order_signatories")
    .upsert(rows, { onConflict: "key" });

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_signatories",
    oldValues: previous as unknown as Record<string, unknown>,
    newValues: Object.fromEntries(
      rows.map(({ key, name, position, office }) => [key, { name, position, office }]),
    ),
  });

  revalidatePath("/job-orders/signatories");
  return { success: true };
}
