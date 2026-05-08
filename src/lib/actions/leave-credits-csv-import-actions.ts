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
  type LeaveTypeLite,
  type SupabaseAdmin,
} from "@/lib/leave-credits-helpers";

function requireSuperAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return "Unauthorized" as const;
  if (user.role !== "super_admin")
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

function parseFloatStrict(s: string | undefined): number | null {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function parseIntStrict(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Strip underscores so "solo_parent" matches "soloparent" matches "SoloParent".
const matchKey = (s: string) => s.toLowerCase().replace(/_/g, "");

const RESERVED_HEADERS = new Set([
  "employee_id",
  "employee_uuid",
  "id",
  "uuid",
  "leave_type_id",
  "leave_type_uuid",
  "leave_type_code",
  "leave_code",
  "code",
  "year",
  "total_credits",
  "total",
  "used_credits",
  "used",
  "balance",
  "employee_name",
  "name",
  "first_name",
  "last_name",
  "department",
]);

async function applyOneCell(
  supabase: SupabaseAdmin,
  userId: string,
  employeeId: string,
  leaveTypeId: string,
  leaveTypeCode: string | null,
  year: number,
  total: number
): Promise<string | null> {
  const { error: ledgerErr } = await replaceCsvImportLedger(supabase, {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
    amount: total,
    notes: `CSV import baseline (total=${total})`,
    created_by: userId,
  });
  if (ledgerErr) return ledgerErr;

  const { error: recompErr } = await recomputeLeaveCreditTotal(supabase, {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
  });
  if (recompErr) return recompErr;

  if (leaveTypeCode === "VL" || leaveTypeCode === "SL") {
    await supabase
      .schema("hris")
      .from("employees")
      .update({ vl_sl_needs_manual_entry: false })
      .eq("id", employeeId);
  }
  return null;
}

export async function importLeaveCreditsFromCsv(csvText: string): Promise<
  | {
      ok: true;
      format: "long" | "wide";
      processed: number;
      imported: number;
      skipped: number;
      errors: string[];
    }
  | { error: string }
> {
  const user = await getCurrentUser();
  const deny = requireSuperAdmin(user);
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
  if (idCol === undefined) {
    return {
      error: "CSV needs an employee_id column.",
    };
  }

  const supabase = createAdminClient();
  const { byId: ltById, byCode: ltByCode } = await getLeaveTypeMap(supabase);

  // Wide-format detection: any header whose match-key equals a known
  // leave_type code. e.g. headers `vl`, `sl`, `spl` \u2192 VL/SL/SPL columns.
  const codeByMatchKey = new Map<string, LeaveTypeLite>();
  for (const [code, lt] of ltByCode) {
    codeByMatchKey.set(matchKey(code), lt);
  }
  const wideTypeCols: { lt: LeaveTypeLite; col: number }[] = [];
  for (let i = 0; i < header.length; i++) {
    if (i === idCol) continue;
    if (RESERVED_HEADERS.has(header[i])) continue;
    const lt = codeByMatchKey.get(matchKey(header[i]));
    if (lt) wideTypeCols.push({ lt, col: i });
  }

  const totalCol = colIndex(map, "total_credits", "total");
  const yearCol = colIndex(map, "year");
  const isLongFormat =
    totalCol !== undefined &&
    (colIndex(map, "leave_type_id", "leave_type_uuid") !== undefined ||
      colIndex(map, "leave_type_code", "leave_code", "code") !== undefined);

  if (!isLongFormat && wideTypeCols.length === 0) {
    return {
      error:
        "CSV must be either: long-format (employee_id, leave_type_code, year, total_credits) or wide-format (employee_id, vl, sl, spl, ...). No leave-type columns or total_credits column found.",
    };
  }

  const defaultYear = new Date().getFullYear();

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

    // Year applies to all cells on the row. Optional in wide format
    // (defaults to current year); required in long format.
    let year: number;
    if (yearCol !== undefined && (row[yearCol] ?? "").trim()) {
      const parsed = parseIntStrict(row[yearCol]);
      if (parsed === null || parsed < 2000 || parsed > 2100) {
        errors.push(`Row ${r + 1}: invalid year`);
        skipped++;
        continue;
      }
      year = parsed;
    } else if (isLongFormat) {
      errors.push(`Row ${r + 1}: missing year`);
      skipped++;
      continue;
    } else {
      year = defaultYear;
    }

    if (isLongFormat) {
      // \u2500\u2500 Long format: one record per row \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      const ltIdCol = colIndex(map, "leave_type_id", "leave_type_uuid");
      const ltCodeCol = colIndex(map, "leave_type_code", "leave_code", "code");

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
        const lt =
          code ? ltByCode.get(code) ?? codeByMatchKey.get(matchKey(code)) : null;
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

      const total = parseFloatStrict(row[totalCol!]);
      if (total === null) {
        errors.push(`Row ${r + 1}: invalid total_credits`);
        skipped++;
        continue;
      }

      const err = await applyOneCell(
        supabase,
        user.id,
        employeeId,
        leaveTypeId,
        ltById.get(leaveTypeId)?.code ?? null,
        year,
        total
      );
      if (err) {
        errors.push(`Row ${r + 1}: ${err}`);
        skipped++;
        continue;
      }
      imported++;
    } else {
      // \u2500\u2500 Wide format: one record per leave-type column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      let rowImported = 0;
      let rowFailed = false;
      for (const { lt, col } of wideTypeCols) {
        const cell = (row[col] ?? "").trim();
        if (!cell) continue; // empty cell = skip silently
        const total = parseFloatStrict(cell);
        if (total === null) {
          errors.push(
            `Row ${r + 1}: invalid number for ${lt.code} ("${cell}")`
          );
          rowFailed = true;
          continue;
        }
        const err = await applyOneCell(
          supabase,
          user.id,
          employeeId,
          lt.id,
          lt.code,
          year,
          total
        );
        if (err) {
          errors.push(`Row ${r + 1} ${lt.code}: ${err}`);
          rowFailed = true;
          continue;
        }
        rowImported++;
      }
      if (rowImported > 0) imported++;
      if (rowImported === 0 && rowFailed) skipped++;
    }
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "leave_credits_csv_import",
    tableName: "leave_credit_accruals",
    newValues: {
      format: isLongFormat ? "long" : "wide",
      processed,
      imported,
      skipped,
      errors: errors.length,
    },
  });

  revalidatePath("/leaves/credits");
  revalidatePath("/admin/leave-credits-import");
  return {
    ok: true,
    format: isLongFormat ? "long" : "wide",
    processed,
    imported,
    skipped,
    errors,
  };
}
