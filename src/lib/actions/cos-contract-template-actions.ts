"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos, canManageCosTemplates, hasRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosContractTemplateFormSchema,
  type CosContractTemplateFormValues,
} from "@/lib/validations/cos-contract-schema";
import type { TiptapNode } from "@/lib/cos-contract-doc";

const UNIQUE_VIOLATION = "23505";

export interface CosContractTemplate {
  id: string;
  name: string;
  description: string | null;
  body: TiptapNode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

/**
 * The ONLY place `cos_contract_templates` is read from. Applies the schema and
 * the soft-delete filter together so neither can be forgotten at a call site.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .select("*")
    .is("deleted_at", null);
}

/** Reads use canManageCos so contract authors can populate the picker. */
export async function getCosContractTemplates(): Promise<CosContractTemplate[]> {
  const user = await getCurrentUser();
  if (!user || !canManageCos(user.roles)) return [];

  const { data, error } = await baseQuery().order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractTemplate[];
}

export async function getCosContractTemplate(
  id: string,
): Promise<CosContractTemplate | null> {
  const user = await getCurrentUser();
  if (!user || !canManageCos(user.roles)) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as CosContractTemplate) ?? null;
}

export async function createCosContractTemplate(
  input: CosContractTemplateFormValues,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCosTemplates(user.roles))
    return { error: "Insufficient permissions" };

  const parsed = cosContractTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .insert({
      ...parsed.data,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `A template named "${parsed.data.name}" already exists`,
        field: "name" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_created",
    tableName: "cos_contract_templates",
    recordId: data.id,
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/templates");
  return { data: data as unknown as CosContractTemplate };
}

export async function updateCosContractTemplate(
  id: string,
  input: CosContractTemplateFormValues,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCosTemplates(user.roles))
    return { error: "Insufficient permissions" };

  const parsed = cosContractTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContractTemplate(id);
  if (!before) return { error: "Template not found" };

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `A template named "${parsed.data.name}" already exists`,
        field: "name" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_updated",
    tableName: "cos_contract_templates",
    recordId: id,
    oldValues: { ...before },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/templates");
  revalidatePath(`/cos/templates/${id}/edit`);
  return { data: data as unknown as CosContractTemplate };
}

/**
 * Soft delete. Contracts hold their own body snapshot and only a nullable
 * template_id, so retiring a template never touches contract history.
 */
export async function deleteCosContractTemplate(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!hasRole(user.roles, "super_admin")) return { error: "Insufficient permissions" };

  const before = await getCosContractTemplate(id);
  if (!before) return { error: "Template not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_deleted",
    tableName: "cos_contract_templates",
    recordId: id,
    oldValues: { ...before },
  });

  revalidatePath("/cos/templates");
  return { success: true as const };
}
