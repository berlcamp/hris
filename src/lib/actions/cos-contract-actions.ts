"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosContractFormSchema,
  cosContractTerminationSchema,
  type CosContractFormValues,
  type CosContractTerminationValues,
} from "@/lib/validations/cos-contract-schema";
import type { TiptapNode } from "@/lib/cos-contract-doc";
import type { CosContractStatus } from "@/lib/cos-constants";

const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";
const CHECK_VIOLATION = "23514";

const SELECT_WITH_EMPLOYEE =
  "*, cos_employees(id, cos_no, first_name, middle_name, last_name, suffix, address, status, departments(name))";

export interface CosContractWithEmployee {
  id: string;
  cos_employee_id: string;
  period_start: string;
  period_end: string;
  monthly_rate: number | null;
  position_title: string | null;
  scope_of_work: string | null;
  signatory_name: string | null;
  signatory_position: string | null;
  witness_name: string | null;
  witness_position: string | null;
  body: TiptapNode;
  template_id: string | null;
  renewed_from_id: string | null;
  status: CosContractStatus;
  terminated_on: string | null;
  termination_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  cos_employees: {
    id: string;
    cos_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    address: string | null;
    status: string;
    departments: { name: string } | null;
  } | null;
}

/**
 * The ONLY place `cos_contracts` is read from. Applies the schema and the
 * soft-delete filter together so neither can be forgotten at a call site.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .select(SELECT_WITH_EMPLOYEE)
    .is("deleted_at", null);
}

async function requireCosManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" as const };
  if (!canManageCos(user.role)) return { error: "Insufficient permissions" as const };
  return { user };
}

/**
 * Maps the constraints in migration 063 to field errors. A signatory must never
 * see a raw Postgres message.
 */
function mapDbError(code: string | undefined, message: string) {
  if (code === EXCLUSION_VIOLATION) {
    return {
      error: "This employee already has a contract covering these dates",
      field: "period_start" as const,
    };
  }
  if (code === UNIQUE_VIOLATION) {
    return {
      error: "That contract has already been renewed",
      field: "period_start" as const,
    };
  }
  if (code === CHECK_VIOLATION) {
    return { error: "The dates on this contract are inconsistent" };
  }
  return { error: message };
}

/**
 * Returns every live contract. Filtering is deliberately NOT a parameter here:
 * `<DataTable>` filters client-side across this module (see
 * cos-employee-list-client.tsx), and a server-side filter that the table then
 * re-applied would be two sources of truth for one question.
 */
export async function getCosContracts(): Promise<CosContractWithEmployee[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery().order("period_start", {
    ascending: false,
  });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractWithEmployee[];
}

export async function getCosContract(
  id: string,
): Promise<CosContractWithEmployee | null> {
  const auth = await requireCosManager();
  if ("error" in auth) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as CosContractWithEmployee) ?? null;
}

/** Oldest-first: the profile timeline renders the renewal chain in order. */
export async function getContractsForEmployee(
  employeeId: string,
): Promise<CosContractWithEmployee[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery()
    .eq("cos_employee_id", employeeId)
    .order("period_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractWithEmployee[];
}

/** COS-1's rule: an inactive employee cannot receive a new contract. */
async function assertEmployeeActive(employeeId: string) {
  const { data } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .select("status")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return { error: "COS employee not found" };
  if (data.status !== "active") {
    return { error: "An inactive employee cannot receive a new contract" };
  }
  return null;
}

export async function createCosContract(input: CosContractFormValues) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const inactive = await assertEmployeeActive(parsed.data.cos_employee_id);
  if (inactive) return inactive;

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .insert({
      ...parsed.data,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_created",
    tableName: "cos_contracts",
    recordId: data.id,
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${parsed.data.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function updateCosContract(
  id: string,
  input: CosContractFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };

  // The employee is fixed at creation: moving a contract between people would
  // silently rewrite two employees' histories at once.
  const { cos_employee_id: _ignored, ...editable } = parsed.data;

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({ ...editable, updated_by: auth.user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_updated",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { ...before },
    newValues: { ...editable },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/contracts/${id}`);
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function renewCosContract(
  sourceId: string,
  input: CosContractFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const source = await getCosContract(sourceId);
  if (!source) return { error: "Contract to renew not found" };

  const inactive = await assertEmployeeActive(source.cos_employee_id);
  if (inactive) return inactive;

  // "Effective end" is COALESCE(terminated_on, period_end) — the same
  // expression the exclusion constraint uses, so this friendly check and the
  // database can never disagree.
  const effectiveEnd = source.terminated_on ?? source.period_end;
  if (parsed.data.period_start <= effectiveEnd) {
    return {
      error: `A renewal must start after ${effectiveEnd}`,
      field: "period_start" as const,
    };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .insert({
      ...parsed.data,
      cos_employee_id: source.cos_employee_id,
      renewed_from_id: sourceId,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_renewed",
    tableName: "cos_contracts",
    recordId: data.id,
    oldValues: { renewed_from_id: sourceId },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${source.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function terminateCosContract(
  id: string,
  input: CosContractTerminationValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractTerminationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };
  if (before.status === "terminated") {
    return { error: "This contract is already terminated" };
  }

  const { terminated_on } = parsed.data;
  if (terminated_on < before.period_start || terminated_on > before.period_end) {
    return {
      error: "The termination date must fall inside the contract period",
      field: "terminated_on" as const,
    };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({
      status: "terminated",
      terminated_on,
      termination_reason: parsed.data.termination_reason,
      updated_by: auth.user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_terminated",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { status: before.status },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/contracts/${id}`);
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function deleteCosContract(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_deleted",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { ...before },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { success: true as const };
}
