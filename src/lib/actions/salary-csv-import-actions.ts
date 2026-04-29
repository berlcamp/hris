"use server";

import { revalidatePath } from "next/cache";
import { parseCsvTextToRows } from "@/lib/parse-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NOSI_BASIS_SALARY_REASONS } from "@/lib/constants";
import type { Database } from "@/lib/database.types";

type SalaryChangeReason = Database["hris"]["Enums"]["salary_change_reason"];

const BASIS_SET = new Set<string>(NOSI_BASIS_SALARY_REASONS);

const VALID_REASONS: Set<string> = new Set([
  "initial",
  "step_increment",
  "promotion",
  "reclassification",
  "salary_standardization",
  "adjustment",
  "demotion",
]);

const UPSERT_CHUNK = 200;

function requireHrAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return "Unauthorized" as const;
  if (!["super_admin", "hr_admin"].includes(user.role))
    return "Insufficient permissions" as const;
  return null;
}

function normHeader(h: string): string {
  return h.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, "_");
}

function colIndex(map: Map<string, number>, ...names: string[]): number | undefined {
  for (const n of names) {
    const i = map.get(n);
    if (i !== undefined) return i;
  }
  return undefined;
}

function parseMoney(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseIntStrict(s: string): number | null {
  const n = Number(String(s).trim());
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Accepts YYYY-MM-DD or MM/DD/YYYY (US). Returns YYYY-MM-DD or null. */
function parseFlexibleCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : s;
  }

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
      return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

export async function importSalaryGradeMatrixFromCsv(
  csvText: string,
  tranche: number,
  effectiveYear: number
): Promise<{ ok: true; upserted: number; rowErrors: string[] } | { error: string }> {
  const user = await getCurrentUser();
  const deny = requireHrAdmin(user);
  if (deny) return { error: deny };

  if (!Number.isFinite(tranche) || !Number.isInteger(effectiveYear))
    return { error: "Tranche and effective year must be integers." };

  const rows = parseCsvTextToRows(csvText);
  if (rows.length < 2)
    return { error: "CSV must include a header row and at least one data row." };

  const header = rows[0].map(normHeader);
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    map.set(h, i);
  });

  const gCol = colIndex(map, "grade", "salary_grade", "sg");
  const sCol = colIndex(map, "step");
  const aCol = colIndex(map, "amount", "salary", "salary_amount");
  if (gCol === undefined || sCol === undefined || aCol === undefined) {
    return {
      error:
        "Matrix CSV needs columns: grade (or salary_grade), step, amount (or salary_amount).",
    };
  }

  const batch: {
    grade: number;
    step: number;
    amount: number;
    tranche: number;
    effective_year: number;
  }[] = [];
  const rowErrors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const grade = parseIntStrict(row[gCol] ?? "");
    const step = parseIntStrict(row[sCol] ?? "");
    const amount = parseMoney(row[aCol] ?? "");
    if (grade === null || grade < 1 || step === null || step < 1 || amount === null || amount < 0) {
      rowErrors.push(`Row ${r + 1}: invalid grade, step, or amount`);
      continue;
    }
    batch.push({
      grade,
      step,
      amount,
      tranche: Math.trunc(tranche),
      effective_year: Math.trunc(effectiveYear),
    });
  }

  if (batch.length === 0) {
    return {
      error:
        rowErrors.slice(0, 8).join("; ") ||
        "No valid data rows.",
    };
  }

  const supabase = createAdminClient();
  for (let i = 0; i < batch.length; i += UPSERT_CHUNK) {
    const slice = batch.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .schema("hris")
      .from("salary_grade_table")
      .upsert(slice, { onConflict: "grade,step,tranche" });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/salary-grades");
  revalidatePath("/admin/salary-import");
  revalidatePath("/nosi");
  return { ok: true, upserted: batch.length, rowErrors };
}

export async function importEmployeeSalarySyncFromCsv(csvText: string): Promise<
  | {
      ok: true;
      updated: number;
      historyRowsInserted: number;
      skipped: number;
      errors: string[];
    }
  | { error: string }
> {
  const user = await getCurrentUser();
  const deny = requireHrAdmin(user);
  if (deny || !user) return { error: deny ?? "Unauthorized" };

  const rows = parseCsvTextToRows(csvText);
  if (rows.length < 2)
    return { error: "CSV must include a header row and at least one data row." };

  const header = rows[0].map(normHeader);
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    map.set(h, i);
  });

  const idCol = colIndex(map, "employee_id", "employee_uuid", "id", "uuid");
  const gCol = colIndex(map, "salary_grade", "grade", "sg");
  const sCol = colIndex(map, "step_increment", "step");
  const amtCol = colIndex(map, "salary_amount", "amount", "salary");
  const histDateCol = colIndex(
    map,
    "history_effective_date",
    "sync_effective_date",
    "salary_sync_date"
  );
  const basisDateCol = colIndex(
    map,
    "nosi_basis_effective_date",
    "basis_effective_date",
    "last_increment_date"
  );
  const basisReasonCol = colIndex(map, "nosi_basis_reason", "basis_reason");

  if (idCol === undefined || gCol === undefined || sCol === undefined || amtCol === undefined) {
    return {
      error:
        "Employee CSV needs: employee_id (uuid), salary_grade, step_increment, salary_amount.",
    };
  }

  const supabase = createAdminClient();
  let updated = 0;
  let historyRowsInserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[idCol] ?? "").trim();
    const grade = parseIntStrict(row[gCol] ?? "");
    const step = parseIntStrict(row[sCol] ?? "");
    const amount = parseMoney(row[amtCol] ?? "");

    if (!id || grade === null || step === null || amount === null) {
      errors.push(`Row ${r + 1}: missing employee id or invalid numbers`);
      skipped++;
      continue;
    }

    let syncDate =
      histDateCol !== undefined ? (row[histDateCol] ?? "").trim() : "";
    if (!syncDate) syncDate = todayIso();
    const syncIso = parseFlexibleCsvDate(syncDate);
    if (!syncIso) {
      errors.push(
        `Row ${r + 1}: invalid sync date (use YYYY-MM-DD or MM/DD/YYYY)`
      );
      skipped++;
      continue;
    }

    let basisDate: string | null = null;
    let basisReason: SalaryChangeReason | null = null;
    if (basisDateCol !== undefined) {
      const bd = (row[basisDateCol] ?? "").trim();
      if (bd) {
        const basisIso = parseFlexibleCsvDate(bd);
        if (!basisIso) {
          errors.push(
            `Row ${r + 1}: invalid basis_effective_date (use YYYY-MM-DD or MM/DD/YYYY)`
          );
          skipped++;
          continue;
        }
        let resolvedReason: SalaryChangeReason;
        const brRaw =
          basisReasonCol !== undefined
            ? (row[basisReasonCol] ?? "").trim().toLowerCase()
            : "";
        if (brRaw) {
          if (!VALID_REASONS.has(brRaw)) {
            errors.push(`Row ${r + 1}: invalid basis_reason`);
            skipped++;
            continue;
          }
          if (!BASIS_SET.has(brRaw)) {
            errors.push(
              `Row ${r + 1}: basis_reason must reset NOSI clock (e.g. step_increment, promotion)`
            );
            skipped++;
            continue;
          }
          resolvedReason = brRaw as SalaryChangeReason;
        } else {
          resolvedReason = step > 1 ? "step_increment" : "initial";
        }
        basisDate = basisIso;
        basisReason = resolvedReason;
      }
    }

    const { data: updRows, error: upErr } = await supabase
      .schema("hris")
      .from("employees")
      .update({ salary_grade: grade, step_increment: step })
      .eq("id", id)
      .select("id");

    if (upErr) {
      errors.push(`Row ${r + 1}: ${upErr.message}`);
      skipped++;
      continue;
    }
    if (!updRows?.length) {
      errors.push(`Row ${r + 1}: employee not found`);
      skipped++;
      continue;
    }
    updated++;

    if (basisDate && basisReason) {
      const { error: h1 } = await supabase.schema("hris").from("salary_history").insert({
        employee_id: id,
        salary_grade: grade,
        step,
        salary_amount: amount,
        effective_date: basisDate,
        reason: basisReason,
        remarks: "CSV salary sync (NOSI basis)",
        created_by: user.id,
      });
      if (h1) {
        errors.push(`Row ${r + 1}: basis history: ${h1.message}`);
      } else {
        historyRowsInserted++;
      }
    }

    const { error: h2 } = await supabase.schema("hris").from("salary_history").insert({
      employee_id: id,
      salary_grade: grade,
      step,
      salary_amount: amount,
      effective_date: syncIso,
      reason: "adjustment",
      remarks: "CSV salary sync (current SG/step)",
      created_by: user.id,
    });
    if (h2) {
      errors.push(`Row ${r + 1}: sync history: ${h2.message}`);
    } else {
      historyRowsInserted++;
    }
  }

  revalidatePath("/employees");
  revalidatePath("/nosi");
  revalidatePath("/admin/salary-import");
  return { ok: true, updated, historyRowsInserted, skipped, errors };
}
