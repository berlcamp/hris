"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrderPayroll } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { toPayrollMemberSnapshot } from "@/lib/job-order-payroll-helpers";
import { assertDraft } from "@/lib/job-order-payroll-guards";
import {
  loadJobOrdersForSnapshot,
  loadMembers,
  recomputeAreas,
} from "@/lib/job-order-payroll-repo";
import {
  jobOrderPayrollMemberSchema,
  type JobOrderPayrollMemberValues,
} from "@/lib/validations/job-order-payroll-schema";
import type { JobOrderEmployee } from "@/lib/types";

function revalidate(payrollId: string) {
  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${payrollId}`);
}

/** Active JOs not already on this payroll, for the "Add member" search. */
export async function getAddableJobOrders(
  payrollId: string,
): Promise<JobOrderEmployee[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ role: user?.role, canManageModulePayroll: user?.canManageModulePayroll })) {
    return [];
  }

  const supabase = createAdminClient();
  const existing = await loadMembers(supabase, payrollId);
  const taken = new Set(
    existing
      .map((m) => m.job_order_employee_id)
      .filter((id): id is string => id != null),
  );

  const roster = await loadJobOrdersForSnapshot(supabase, {});
  return roster.filter((jo) => !taken.has(jo.id));
}

export async function addJobOrderPayrollMember(
  payrollId: string,
  jobOrderEmployeeId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ role: user?.role, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const [jo] = await loadJobOrdersForSnapshot(supabase, {
    ids: [jobOrderEmployeeId],
  });
  if (!jo) return { error: "Job Order employee not found or inactive" };

  const { data: payroll, error: payrollErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("days")
    .eq("id", payrollId)
    .maybeSingle();
  if (payrollErr) {
    console.error(
      `addJobOrderPayrollMember: failed to read days for payroll ${payrollId}: ${payrollErr.message}`,
    );
  }

  const { data: inserted, error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .insert({
      payroll_id: payrollId,
      job_order_employee_id: jo.id,
      days: (payroll as { days: number | string | null } | null)?.days ?? null,
      hours: null,
      ...toPayrollMemberSnapshot(jo),
    })
    .select("id")
    .single();
  if (error) {
    // uq_job_order_payroll_members — a plain UNIQUE, so this is the only way
    // a duplicate can surface.
    if (error.code === "23505") {
      return { error: "That employee is already on this payroll" };
    }
    return { error: error.message };
  }

  const memberId = (inserted as { id: string } | null)?.id;
  if (!memberId) {
    console.error(
      `addJobOrderPayrollMember: insert for payroll ${payrollId} / JO ${jo.id} succeeded but returned no id; audit will use the payroll id`,
    );
  }

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_payroll_members",
    recordId: memberId ?? payrollId,
    newValues: { job_order_employee_id: jo.id, full_name: jo.full_name },
  });

  revalidate(payrollId);
  return { success: true };
}

export async function updateJobOrderPayrollMember(
  memberId: string,
  input: JobOrderPayrollMemberValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ role: user?.role, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

  const parsed = jobOrderPayrollMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member data" };
  }

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select("id, payroll_id")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const payrollId = (member as { payroll_id: string }).payroll_id;
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .update({
      days: parsed.data.days,
      hours: parsed.data.hours,
      // Snapshot correction only. Never written back to job_order_employees.
      daily_rate: parsed.data.daily_rate,
    })
    .eq("id", memberId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payroll_members",
    recordId: memberId,
    newValues: parsed.data as unknown as Record<string, unknown>,
  });

  revalidate(payrollId);
  return { success: true };
}

export async function removeJobOrderPayrollMember(
  memberId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrderPayroll({ role: user?.role, canManageModulePayroll: user?.canManageModulePayroll })) {
    return { error: "Unauthorized" };
  }

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select("id, payroll_id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const payrollId = (member as { payroll_id: string }).payroll_id;
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .delete()
    .eq("id", memberId);
  if (error) return { error: error.message };

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_payroll_members",
    recordId: memberId,
    oldValues: { full_name: (member as { full_name: string }).full_name },
  });

  revalidate(payrollId);
  return { success: true };
}
