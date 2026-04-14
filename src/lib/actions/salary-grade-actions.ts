"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSalaryGrades(tranche?: number) {
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("*")
    .order("grade")
    .order("step");
  if (tranche) query = query.eq("tranche", tranche);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getDistinctTranches() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .select("tranche, effective_year")
    .order("tranche", { ascending: false });
  if (error) throw error;
  // Deduplicate
  const seen = new Set<number>();
  return (data ?? []).filter((r) => {
    if (seen.has(r.tranche)) return false;
    seen.add(r.tranche);
    return true;
  });
}

export async function createSalaryGradeEntry(input: {
  grade: number;
  step: number;
  amount: number;
  tranche: number;
  effective_year: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .insert(input)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return { error: "An entry for this grade/step/tranche already exists." };
    return { error: error.message };
  }
  revalidatePath("/admin/salary-grades");
  return { data };
}

export async function updateSalaryGradeEntry(id: string, input: {
  grade: number;
  step: number;
  amount: number;
  tranche: number;
  effective_year: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/salary-grades");
  return { data };
}

export async function deleteSalaryGradeEntry(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/salary-grades");
  return { success: true };
}

export async function bulkImportSalaryGrades(entries: {
  grade: number;
  step: number;
  amount: number;
  tranche: number;
  effective_year: number;
}[]) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("salary_grade_table")
    .upsert(entries, { onConflict: "grade,step,tranche" });
  if (error) return { error: error.message };
  revalidatePath("/admin/salary-grades");
  return { success: true, count: entries.length };
}
