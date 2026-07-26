"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosEmployeeFormSchema,
  type CosEmployeeFormValues,
} from "@/lib/validations/cos-employee-schema";
import type { CosEmployeeStatus, CosSex } from "@/lib/cos-constants";

const UNIQUE_VIOLATION = "23505";

const SELECT_WITH_DEPARTMENT =
  "*, departments(name, code)";

export interface CosEmployeeWithDepartment {
  id: string;
  cos_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  sex: CosSex | null;
  birth_date: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  department_id: string | null;
  position_title: string | null;
  eligibility: string | null;
  recommended_by: string | null;
  remarks: string | null;
  status: CosEmployeeStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  departments: { name: string; code: string } | null;
}

interface AuthOk {
  user: { id: string; email: string };
}

async function requireCosManager(): Promise<AuthOk | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCos(user.role)) return { error: "Insufficient permissions" };
  return { user: { id: user.id, email: user.email } };
}

/**
 * The ONLY place `cos_employees` is read from. Applies the schema and the
 * soft-delete filter together so neither can be forgotten at a call site.
 * Do not call `.from("cos_employees")` anywhere else in this module.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .select(SELECT_WITH_DEPARTMENT)
    .is("deleted_at", null);
}

export async function getCosEmployees(): Promise<CosEmployeeWithDepartment[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery()
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as CosEmployeeWithDepartment[];
}

export async function getCosEmployee(
  id: string,
): Promise<CosEmployeeWithDepartment | null> {
  const auth = await requireCosManager();
  if ("error" in auth) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();

  if (error) throw error;
  return (data as unknown as CosEmployeeWithDepartment) ?? null;
}

export async function createCosEmployee(input: CosEmployeeFormValues) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .insert({
      ...parsed.data,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_DEPARTMENT)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `COS number "${parsed.data.cos_no}" is already in use`,
        field: "cos_no" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_employee_created",
    tableName: "cos_employees",
    recordId: data.id,
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/employees");
  return { data: data as unknown as CosEmployeeWithDepartment };
}

export async function updateCosEmployee(
  id: string,
  input: CosEmployeeFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosEmployee(id);
  if (!before) return { error: "COS employee not found" };

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .update({ ...parsed.data, updated_by: auth.user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_DEPARTMENT)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `COS number "${parsed.data.cos_no}" is already in use`,
        field: "cos_no" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_employee_updated",
    tableName: "cos_employees",
    recordId: id,
    oldValues: { ...before },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/employees");
  revalidatePath(`/cos/employees/${id}`);
  return { data: data as unknown as CosEmployeeWithDepartment };
}

/**
 * Soft delete. Contracts (COS-3) reference these rows, so a hard delete would
 * orphan contract history. super_admin only, matching the destructive-delete
 * rule the payroll actions already follow.
 */
export async function deleteCosEmployee(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };

  const before = await getCosEmployee(id);
  if (!before) return { error: "COS employee not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_employee_deleted",
    tableName: "cos_employees",
    recordId: id,
    oldValues: { ...before },
  });

  revalidatePath("/cos/employees");
  revalidatePath(`/cos/employees/${id}`);
  return { success: true as const };
}
