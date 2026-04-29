"use server";

import { revalidatePath } from "next/cache";
import { parseCsvTextToRows } from "@/lib/parse-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  getLeaveTypeMap,
  recomputeLeaveCreditTotal,
  replaceCsvImportLedger,
} from "@/lib/leave-credits-helpers";

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

function parseNonNegFloat(s: string | undefined): number | null {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseIntStrict(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function importLeaveCreditsFromCsv(csvText: string): Promise<
  | {
      ok: true;
      processed: number;
      imported: number;
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
  const ltIdCol = colIndex(map, "leave_type_id", "leave_type_uuid");
  const ltCodeCol = colIndex(map, "leave_type_code", "leave_code", "code");
  const yearCol = colIndex(map, "year");
  const totalCol = colIndex(map, "total_credits", "total");
  const usedCol = colIndex(map, "used_credits", "used");

  if (idCol === undefined) {
    return {
      error:
        "Leave credits CSV needs columns: employee_id, leave_type_id (or leave_type_code), year, total_credits, used_credits. (balance is ignored.)",
    };
  }
  if (ltIdCol === undefined && ltCodeCol === undefined) {
    return {
      error:
        "CSV needs leave_type_id (uuid) or leave_type_code (e.g. VL/SL/SPL).",
    };
  }
  if (yearCol === undefined || totalCol === undefined) {
    return { error: "CSV needs columns: year, total_credits." };
  }

  const supabase = createAdminClient();
  const { byId: ltById, byCode: ltByCode } = await getLeaveTypeMap(supabase);

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    processed++;

    const employeeId = (row[idCol] ?? "").trim();
    if (!employeeId) {
      errors.push(`Row ${r + 1}: missing employee_id`);
      skipped++;
      continue;
    }
    if (!UUID_RE.test(employeeId)) {
      errors.push(`Row ${r + 1}: employee_id is not a valid UUID`);
      skipped++;
      continue;
    }

    let leaveTypeId: string | null = null;
    if (ltIdCol !== undefined) {
      const v = (row[ltIdCol] ?? "").trim();
      if (v) {
        if (!UUID_RE.test(v)) {
          errors.push(`Row ${r + 1}: leave_type_id is not a valid UUID`);
          skipped++;
          continue;
        }
        if (!ltById.has(v)) {
          errors.push(`Row ${r + 1}: leave_type_id not found`);
          skipped++;
          continue;
        }
        leaveTypeId = v;
      }
    }
    if (!leaveTypeId && ltCodeCol !== undefined) {
      const code = (row[ltCodeCol] ?? "").trim();
      const lt = code ? ltByCode.get(code) : null;
      if (!lt) {
        errors.push(`Row ${r + 1}: unknown leave_type_code "${code}"`);
        skipped++;
        continue;
      }
      leaveTypeId = lt.id;
    }
    if (!leaveTypeId) {
      errors.push(`Row ${r + 1}: missing leave_type_id and leave_type_code`);
      skipped++;
      continue;
    }

    const year = parseIntStrict(row[yearCol]);
    if (year === null || year < 2000 || year > 2100) {
      errors.push(`Row ${r + 1}: invalid year`);
      skipped++;
      continue;
    }

    const total = parseNonNegFloat(row[totalCol]);
    if (total === null) {
      errors.push(`Row ${r + 1}: invalid total_credits`);
      skipped++;
      continue;
    }
    const used =
      usedCol !== undefined ? parseNonNegFloat(row[usedCol]) ?? 0 : 0;
    if (used > total) {
      errors.push(
        `Row ${r + 1}: used_credits (${used}) exceeds total_credits (${total})`
      );
      skipped++;
      continue;
    }

    const { data: emp } = await supabase
      .schema("hris")
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp) {
      errors.push(`Row ${r + 1}: employee not found`);
      skipped++;
      continue;
    }

    const { error: ledgerErr } = await replaceCsvImportLedger(supabase, {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      amount: total,
      notes: `CSV import baseline (total=${total})`,
      created_by: user.id,
    });
    if (ledgerErr) {
      errors.push(`Row ${r + 1}: ${ledgerErr}`);
      skipped++;
      continue;
    }

    const { error: recompErr } = await recomputeLeaveCreditTotal(supabase, {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      used_credits_override: used,
    });
    if (recompErr) {
      errors.push(`Row ${r + 1}: ${recompErr}`);
      skipped++;
      continue;
    }

    imported++;
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "leave_credits_csv_import",
    tableName: "leave_credit_accruals",
    newValues: { processed, imported, skipped, errors: errors.length },
  });

  revalidatePath("/leaves/credits");
  revalidatePath("/admin/leave-credits-import");
  return { ok: true, processed, imported, skipped, errors };
}
