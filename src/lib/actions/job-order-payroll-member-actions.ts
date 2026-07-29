"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { toPayrollMemberSnapshot } from "@/lib/job-order-payroll-helpers";
import {
  assertDraft,
  loadJobOrdersForSnapshot,
  loadMembers,
  recomputeAreas,
} from "@/lib/actions/job-order-payroll-actions";
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
  if (!canManageJobOrders(user?.role)) return [];

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
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

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
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

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
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

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

/**
 * Re-copy the snapshot for members still linked to a live roster row.
 *
 * Deliberately never adds or removes members: a JO newly hired into the area
 * does not appear, and one who became inactive is not dropped. Membership
 * stays the user's explicit decision; this refreshes values only.
 */
export async function refreshMembersFromRoster(
  payrollId: string,
): Promise<{ updated?: number; skipped?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const members = await loadMembers(supabase, payrollId);
  const linked = members.filter((m) => m.job_order_employee_id != null);
  const skipped = members.length - linked.length;
  if (linked.length === 0) return { updated: 0, skipped };

  // No deleted_at filter beyond what loadJobOrdersForSnapshot applies: a
  // member whose JO was soft-deleted simply does not come back and is counted
  // as skipped, rather than being wiped.
  const roster = await loadJobOrdersForSnapshot(supabase, {
    ids: linked.map((m) => m.job_order_employee_id!),
  });
  const byId = new Map(roster.map((jo) => [jo.id, jo]));

  let updated = 0;
  let missing = 0;
  let failed = 0;
  for (const m of linked) {
    const jo = byId.get(m.job_order_employee_id!);
    if (!jo) {
      missing += 1;
      continue;
    }
    const snap = toPayrollMemberSnapshot(jo);
    const changed =
      snap.full_name !== m.full_name ||
      snap.area_name !== m.area_name ||
      snap.sub_area !== m.sub_area ||
      snap.daily_rate !== m.daily_rate ||
      snap.sss_no !== m.sss_no ||
      snap.sss_ss !== m.sss_ss ||
      snap.sss_ec !== m.sss_ec ||
      snap.has_atm !== m.has_atm ||
      snap.landbank_account_number !== m.landbank_account_number ||
      snap.community_tax_number !== m.community_tax_number ||
      snap.community_tax_date !== m.community_tax_date ||
      snap.community_tax_place_issued !== m.community_tax_place_issued;
    if (!changed) continue;

    const { error } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .update(snap)
      .eq("id", m.id);
    if (error) {
      // Log-and-continue: one bad row must not abandon the rest of the
      // refresh, strand recomputeAreas()/logAudit() from running for the
      // members that did succeed, or leave `areas` stale. Counted into
      // `skipped` so the totals still reconcile against members.length.
      console.error(
        `refreshMembersFromRoster: failed to update member ${m.id} (payroll ${payrollId}): ${error.message}`,
      );
      failed += 1;
      continue;
    }
    updated += 1;
  }

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payroll_members",
    recordId: payrollId,
    newValues: { refreshed: updated, skipped: skipped + missing + failed },
  });

  revalidate(payrollId);
  return { updated, skipped: skipped + missing + failed };
}
