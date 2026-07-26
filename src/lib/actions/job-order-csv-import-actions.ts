"use server";

import { revalidatePath } from "next/cache";
import { parseCsvTextToRows } from "@/lib/parse-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  normHeader,
  colIndex,
  parseMoney,
  parseFlexibleCsvDate,
} from "@/lib/csv-import-helpers";
import {
  deriveSortName,
  normalizeAreaName,
  parseJoBoolean,
} from "@/lib/job-order-helpers";

const UPSERT_CHUNK = 200;

export interface JoImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
  areasCreated: string[];
}

function emptyResult(): JoImportResult {
  return { inserted: 0, updated: 0, skipped: 0, errors: [], warnings: [], areasCreated: [] };
}

// This import screen is guarded tighter than the rest of the Job Orders
// module (canManageJobOrders also admits hr_admin / jo_manager): a one-shot
// bulk load of the legacy roster is a super_admin-only operation, matching
// the other CSV import screens (salary, leave credits).
async function requireSuperAdmin(): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };
  return { user };
}

/** Blank strings from the CSV become NULL, not ''. */
function nullable(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length === 0 ? null : v;
}

/**
 * Runs `parser` only when `raw` is non-blank. A blank cell is simply "no
 * data" and resolves to null with no warning. A non-blank cell that the
 * parser rejects is the "parse failure" the task's single most important
 * rule is about: it must never reject the row, only the column — write null
 * and record a warning naming the row, column and offending raw value.
 */
function warnParse<T>(
  rowNum: number,
  column: string,
  raw: string | undefined,
  warnings: string[],
  parser: (s: string) => T | null,
): T | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const parsed = parser(trimmed);
  if (parsed === null) {
    warnings.push(`Row ${rowNum}: could not parse ${column} "${raw}" — left blank`);
    return null;
  }
  return parsed;
}

function parseSex(s: string): "male" | "female" | null {
  const v = s.toLowerCase();
  return v === "male" || v === "female" ? v : null;
}

// supabase/config.toml caps PostgREST's `max_rows` at 1000. A plain
// unpaginated select would silently truncate once job_order_areas grows past
// that — see countEmployeesByArea in job-order-area-actions.ts for the
// established pattern this mirrors. Areas are few today (~54) but the
// importer must not quietly start missing matches as the table grows.
async function loadAreaMap(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const PAGE_SIZE = 1000;
  const map = new Map<string, string>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_areas")
      .select("id, name")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load existing areas: ${error.message}`);

    for (const row of (data ?? []) as { id: string; name: string }[]) {
      map.set(normalizeAreaName(row.name), row.id);
    }

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return map;
}

/**
 * Resolves a legacy `area_assigned` value to an area id, creating the area
 * (and recording its name in `areasCreated`) the first time it is seen. A
 * blank value always resolves to the seeded "Unassigned" area — area_id is
 * NOT NULL on job_order_employees, so migrated rows with no legacy area must
 * still land somewhere.
 */
async function resolveAreaId(
  raw: string,
  areaMap: Map<string, string>,
  supabase: ReturnType<typeof createAdminClient>,
  areasCreated: string[],
): Promise<{ id: string } | { error: string }> {
  const trimmed = raw.trim();
  const nameToUse = trimmed || "Unassigned";
  const norm = normalizeAreaName(nameToUse);

  const existingId = areaMap.get(norm);
  if (existingId) return { id: existingId };

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .insert({ name: nameToUse })
    .select("id, name")
    .single();

  if (error) return { error: error.message };

  areaMap.set(norm, data.id);
  areasCreated.push(data.name);
  return { id: data.id };
}

/**
 * Simpler sibling of importJobOrderEmployeesFromCsv: seeds job_order_areas
 * from a standalone `area_assigned` column CSV so an admin can pre-populate
 * (and eyeball) the area list before uploading the much larger employee
 * roster. Names already present (matched via normalizeAreaName, the same
 * generated-column-identical comparison the DB itself uses) are skipped
 * rather than duplicated.
 */
export async function importJobOrderAreasFromCsv(csvText: string): Promise<JoImportResult> {
  const result = emptyResult();

  const guard = await requireSuperAdmin();
  if ("error" in guard) {
    result.errors.push(guard.error);
    return result;
  }
  const { user } = guard;

  const rows = parseCsvTextToRows(csvText);
  if (rows.length < 2) {
    result.errors.push("CSV must include a header row and at least one data row.");
    return result;
  }

  const header = rows[0].map(normHeader);
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(h, i));

  const nameCol = colIndex(map, "area_assigned");
  if (nameCol === undefined) {
    result.errors.push('CSV needs an "area_assigned" column.');
    return result;
  }

  const supabase = createAdminClient();
  const existing = await loadAreaMap(supabase);
  const seenThisRun = new Set<string>();
  const toInsert: { name: string }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const raw = (rows[r][nameCol] ?? "").trim();
    if (!raw) {
      result.skipped++;
      continue;
    }
    const norm = normalizeAreaName(raw);
    if (existing.has(norm) || seenThisRun.has(norm)) {
      result.skipped++;
      continue;
    }
    seenThisRun.add(norm);
    toInsert.push({ name: raw });
  }

  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_areas")
      .insert(chunk)
      .select("id, name");

    if (error) {
      result.errors.push(`Failed to insert ${chunk.length} area(s): ${error.message}`);
      continue;
    }
    for (const a of (data ?? []) as { id: string; name: string }[]) {
      result.inserted++;
      result.areasCreated.push(a.name);
    }
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import",
    tableName: "job_order_areas",
    newValues: {
      inserted: result.inserted,
      skipped: result.skipped,
      errorCount: result.errors.length,
    },
  });

  revalidatePath("/job-orders/areas");
  revalidatePath("/job-orders");

  return result;
}

interface EmployeeUpsertRow {
  legacy_id: number;
  full_name: string;
  sort_name: string;
  sex: "male" | "female" | null;
  purok: string | null;
  barangay: string | null;
  area_id: string;
  sub_area: string | null;
  daily_rate: number | null;
  previous_daily_rate: number | null;
  working_hours: number | null;
  date_started: string | null;
  eligibility: string | null;
  recommended_by: string | null;
  remarks: string | null;
  remarks_2: string | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
  status: "active";
  deleted_at: string | null;
}

// Pre-checks which legacy_id values already exist so the summary can report
// genuine insert vs. update counts — a single `.upsert()` call does not tell
// the caller which rows it inserted vs. updated. Chunked and paginated the
// same way the rest of this module reads job_order_employees, since a CSV of
// ~578 people is comfortably under PostgREST's max_rows but there is no
// reason to bet the importer's correctness on the roster staying that small.
async function loadExistingLegacyIds(
  supabase: ReturnType<typeof createAdminClient>,
  legacyIds: number[],
): Promise<Set<number>> {
  const found = new Set<number>();
  for (let i = 0; i < legacyIds.length; i += UPSERT_CHUNK) {
    const slice = legacyIds.slice(i, i + UPSERT_CHUNK);
    if (slice.length === 0) continue;
    const { data, error } = await supabase
      .schema("hris")
      .from("job_order_employees")
      .select("legacy_id")
      .in("legacy_id", slice);

    if (error) throw new Error(`Failed to check existing legacy_id values: ${error.message}`);
    for (const row of (data ?? []) as { legacy_id: number | null }[]) {
      if (row.legacy_id != null) found.add(row.legacy_id);
    }
  }
  return found;
}

/**
 * Imports the legacy `jos` roster. Follows one rule above all others: a
 * parse failure on a messy legacy char/varchar column must never drop a
 * person from the import — only a missing/empty fullname does that, plus two
 * narrow, unavoidable exceptions:
 *   - an unparseable/missing `id` (legacy_id is the upsert idempotency key;
 *     without it a person cannot be matched on re-import and would duplicate
 *     every run instead of updating in place), and
 *   - a duplicate `id` reused by an earlier row in the same file (a single
 *     upsert statement cannot target the same conflict key twice), and
 *   - an area that cannot be resolved/created at all (area_id is NOT NULL,
 *     so there is no null to fall back to).
 * Every other column failure writes null and records a warning instead.
 */
export async function importJobOrderEmployeesFromCsv(csvText: string): Promise<JoImportResult> {
  const result = emptyResult();

  const guard = await requireSuperAdmin();
  if ("error" in guard) {
    result.errors.push(guard.error);
    return result;
  }
  const { user } = guard;

  const rows = parseCsvTextToRows(csvText);
  if (rows.length < 2) {
    result.errors.push("CSV must include a header row and at least one data row.");
    return result;
  }

  const header = rows[0].map(normHeader);
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(h, i));

  const idCol = colIndex(map, "id");
  const fullNameCol = colIndex(map, "fullname");
  if (idCol === undefined || fullNameCol === undefined) {
    result.errors.push('CSV needs "id" and "fullname" columns.');
    return result;
  }

  const areaCol = colIndex(map, "area_assigned");
  const subAreaCol = colIndex(map, "sub_area");
  const rateCol = colIndex(map, "rate");
  const prevRateCol = colIndex(map, "previous_rate");
  const genderCol = colIndex(map, "gender");
  const purokCol = colIndex(map, "purok");
  const barangayCol = colIndex(map, "barangay");
  const hasAtmCol = colIndex(map, "has_atm");
  const workingHoursCol = colIndex(map, "working_hours");
  const accountNumberCol = colIndex(map, "account_number");
  const sssNoCol = colIndex(map, "sss_no");
  const sssSsCol = colIndex(map, "sss_ss");
  const sssEcCol = colIndex(map, "sss_ec");
  const taxNumberCol = colIndex(map, "tax_number");
  const taxDateCol = colIndex(map, "tax_date");
  const taxIssuedCol = colIndex(map, "tax_issued");
  const dateStartedCol = colIndex(map, "date_started");
  const eligibilityCol = colIndex(map, "eligibility");
  const recommendedByCol = colIndex(map, "recommended_by");
  const remarksCol = colIndex(map, "remarks");
  const remarks2Col = colIndex(map, "remarks2");
  const deletedAtCol = colIndex(map, "deleted_at");

  // An absent optional column resolves silently to NULL/false for every row
  // (see resolveAreaId and warnParse above) — there is no per-row signal that
  // anything is missing, so a header mismatch (e.g. the export naming this
  // "daily_rate" instead of "rate") would otherwise produce a clean-looking
  // "inserted N, skipped 0, warnings 0" summary while quietly blanking that
  // field for the entire roster. Emit one warning per expected-but-absent
  // column up front so that failure mode is visible instead of silent. This
  // stays non-fatal — a genuinely absent column still imports the rest.
  const OPTIONAL_COLUMNS: { header: string; index: number | undefined; consequence: string }[] = [
    { header: "area_assigned", index: areaCol, consequence: "every person will be filed under the \"Unassigned\" area instead of their real one" },
    { header: "sub_area", index: subAreaCol, consequence: "sub_area will be blank for every row" },
    { header: "rate", index: rateCol, consequence: "daily_rate will be blank for every row" },
    { header: "previous_rate", index: prevRateCol, consequence: "previous_daily_rate will be blank for every row" },
    { header: "gender", index: genderCol, consequence: "sex will be blank for every row" },
    { header: "purok", index: purokCol, consequence: "purok will be blank for every row" },
    { header: "barangay", index: barangayCol, consequence: "barangay will be blank for every row" },
    { header: "has_atm", index: hasAtmCol, consequence: "has_atm will default to false for every row" },
    { header: "working_hours", index: workingHoursCol, consequence: "working_hours will be blank for every row" },
    { header: "account_number", index: accountNumberCol, consequence: "landbank_account_number will be blank for every row" },
    { header: "sss_no", index: sssNoCol, consequence: "sss_no will be blank for every row" },
    { header: "sss_ss", index: sssSsCol, consequence: "sss_ss will be blank for every row" },
    { header: "sss_ec", index: sssEcCol, consequence: "sss_ec will be blank for every row" },
    { header: "tax_number", index: taxNumberCol, consequence: "community_tax_number will be blank for every row" },
    { header: "tax_date", index: taxDateCol, consequence: "community_tax_date will be blank for every row" },
    { header: "tax_issued", index: taxIssuedCol, consequence: "community_tax_place_issued will be blank for every row" },
    { header: "date_started", index: dateStartedCol, consequence: "date_started will be blank for every row" },
    { header: "eligibility", index: eligibilityCol, consequence: "eligibility will be blank for every row" },
    { header: "recommended_by", index: recommendedByCol, consequence: "recommended_by will be blank for every row" },
    { header: "remarks", index: remarksCol, consequence: "remarks will be blank for every row" },
    { header: "remarks2", index: remarks2Col, consequence: "remarks_2 will be blank for every row" },
    { header: "deleted_at", index: deletedAtCol, consequence: "legacy soft-deletes will not carry over — all imported rows stay active" },
  ];

  for (const { header, index, consequence } of OPTIONAL_COLUMNS) {
    if (index === undefined) {
      result.warnings.push(`Column "${header}" not found in the CSV — ${consequence}`);
    }
  }

  const supabase = createAdminClient();
  const areaMap = await loadAreaMap(supabase);
  const seenLegacyIds = new Map<number, number>(); // legacy_id -> first row number seen

  const batch: EmployeeUpsertRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 1; // header is row 1 in spreadsheet terms
    const rawId = (row[idCol] ?? "").trim();
    const legacyId = rawId ? Number(rawId) : NaN;

    if (!Number.isFinite(legacyId)) {
      result.errors.push(`Row ${rowNum}: missing or invalid id "${row[idCol] ?? ""}" — row skipped`);
      result.skipped++;
      continue;
    }

    if (seenLegacyIds.has(legacyId)) {
      result.errors.push(
        `Row ${rowNum}: duplicate id ${legacyId} (also used by row ${seenLegacyIds.get(legacyId)}) — row skipped`,
      );
      result.skipped++;
      continue;
    }

    const fullName = (row[fullNameCol] ?? "").trim();
    if (!fullName) {
      result.errors.push(`Row ${rowNum}: missing fullname — row skipped`);
      result.skipped++;
      continue;
    }

    const areaResolved = await resolveAreaId(
      areaCol !== undefined ? row[areaCol] ?? "" : "",
      areaMap,
      supabase,
      result.areasCreated,
    );
    if ("error" in areaResolved) {
      result.errors.push(`Row ${rowNum}: could not resolve area assignment — ${areaResolved.error}. Row skipped`);
      result.skipped++;
      continue;
    }

    const hasAtm = hasAtmCol !== undefined ? parseJoBoolean(row[hasAtmCol] ?? "") : false;
    const rawAccountNumber = accountNumberCol !== undefined ? row[accountNumberCol] : undefined;
    // Mirrors chk_job_order_atm_account: without this, a legacy row that has
    // an account number on file but has_atm parses false would be rejected
    // outright by the DB constraint instead of being imported.
    const landbankAccountNumber = hasAtm ? nullable(rawAccountNumber) : null;

    seenLegacyIds.set(legacyId, rowNum);

    batch.push({
      legacy_id: legacyId,
      full_name: fullName,
      sort_name: deriveSortName(fullName),
      sex: warnParse(rowNum, "sex", genderCol !== undefined ? row[genderCol] : undefined, result.warnings, parseSex),
      purok: nullable(purokCol !== undefined ? row[purokCol] : undefined),
      barangay: nullable(barangayCol !== undefined ? row[barangayCol] : undefined),
      area_id: areaResolved.id,
      sub_area: nullable(subAreaCol !== undefined ? row[subAreaCol] : undefined),
      daily_rate: warnParse(rowNum, "daily_rate", rateCol !== undefined ? row[rateCol] : undefined, result.warnings, parseMoney),
      previous_daily_rate: warnParse(
        rowNum,
        "previous_daily_rate",
        prevRateCol !== undefined ? row[prevRateCol] : undefined,
        result.warnings,
        parseMoney,
      ),
      working_hours: warnParse(
        rowNum,
        "working_hours",
        workingHoursCol !== undefined ? row[workingHoursCol] : undefined,
        result.warnings,
        parseMoney,
      ),
      date_started: warnParse(
        rowNum,
        "date_started",
        dateStartedCol !== undefined ? row[dateStartedCol] : undefined,
        result.warnings,
        parseFlexibleCsvDate,
      ),
      eligibility: nullable(eligibilityCol !== undefined ? row[eligibilityCol] : undefined),
      recommended_by: nullable(recommendedByCol !== undefined ? row[recommendedByCol] : undefined),
      remarks: nullable(remarksCol !== undefined ? row[remarksCol] : undefined),
      remarks_2: nullable(remarks2Col !== undefined ? row[remarks2Col] : undefined),
      has_atm: hasAtm,
      landbank_account_number: landbankAccountNumber,
      sss_no: nullable(sssNoCol !== undefined ? row[sssNoCol] : undefined),
      sss_ss: warnParse(rowNum, "sss_ss", sssSsCol !== undefined ? row[sssSsCol] : undefined, result.warnings, parseMoney),
      sss_ec: warnParse(rowNum, "sss_ec", sssEcCol !== undefined ? row[sssEcCol] : undefined, result.warnings, parseMoney),
      community_tax_number: nullable(taxNumberCol !== undefined ? row[taxNumberCol] : undefined),
      community_tax_date: warnParse(
        rowNum,
        "community_tax_date",
        taxDateCol !== undefined ? row[taxDateCol] : undefined,
        result.warnings,
        parseFlexibleCsvDate,
      ),
      community_tax_place_issued: nullable(taxIssuedCol !== undefined ? row[taxIssuedCol] : undefined),
      status: "active",
      deleted_at: nullable(deletedAtCol !== undefined ? row[deletedAtCol] : undefined),
    });
  }

  const existingLegacyIds = await loadExistingLegacyIds(
    supabase,
    batch.map((b) => b.legacy_id),
  );

  for (let i = 0; i < batch.length; i += UPSERT_CHUNK) {
    const chunk = batch.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .schema("hris")
      .from("job_order_employees")
      .upsert(chunk, { onConflict: "legacy_id", ignoreDuplicates: false });

    if (error) {
      result.errors.push(
        `Failed to save ${chunk.length} row(s) (legacy id ${chunk[0].legacy_id}–${chunk[chunk.length - 1].legacy_id}): ${error.message}`,
      );
      result.skipped += chunk.length;
      continue;
    }

    for (const row of chunk) {
      if (existingLegacyIds.has(row.legacy_id)) {
        result.updated++;
      } else {
        result.inserted++;
      }
    }
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "import",
    tableName: "job_order_employees",
    newValues: {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      areasCreated: result.areasCreated,
    },
  });

  revalidatePath("/job-orders");
  revalidatePath("/job-orders/areas");

  return result;
}
