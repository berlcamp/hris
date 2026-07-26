"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { deriveSortName } from "@/lib/job-order-helpers";
import {
  jobOrderEmployeeSchema,
  type JobOrderEmployeeValues,
} from "@/lib/validations/job-order-schema";
import type { JobOrderEmployee } from "@/lib/types";

export interface JobOrderFilters {
  status?: "active" | "inactive" | "all";
  areaId?: string | null;
  hasAtm?: boolean | null;
}

const SELECT_COLUMNS = `
  id, full_name, sort_name, sex, purok, barangay, area_id, sub_area,
  daily_rate, previous_daily_rate, working_hours, date_started, eligibility,
  recommended_by, remarks, remarks_2, has_atm, landbank_account_number,
  sss_no, sss_ss, sss_ec, community_tax_number, community_tax_date,
  community_tax_place_issued, status, legacy_id, created_at, updated_at,
  job_order_areas(name)
`;

type RawRow = Omit<JobOrderEmployee, "area_name"> & {
  job_order_areas: { name: string } | null;
};

// numeric(...) columns come back from PostgREST as strings (it avoids float
// precision loss over JSON), even though the DB type and our TS interface
// both say `number`. Every numeric field must be run through this before it
// is handed back to a caller, or a downstream `previous === current` numeric
// comparison (e.g. the rate-change check in updateJobOrderEmployee) would
// silently compare "400" to 400 and never match.
function toNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function shape(r: RawRow): JobOrderEmployee {
  const { job_order_areas, ...rest } = r;
  return {
    ...rest,
    area_name: job_order_areas?.name ?? null,
    daily_rate: toNumber(rest.daily_rate),
    previous_daily_rate: toNumber(rest.previous_daily_rate),
    working_hours: toNumber(rest.working_hours),
    sss_ss: toNumber(rest.sss_ss),
    sss_ec: toNumber(rest.sss_ec),
  };
}

/** Blank strings from the form become NULL, not ''. */
function nullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

function toRow(input: JobOrderEmployeeValues) {
  return {
    full_name: input.full_name.trim(),
    sort_name: deriveSortName(input.full_name),
    sex: input.sex ?? null,
    purok: nullable(input.purok),
    barangay: nullable(input.barangay),
    area_id: input.area_id,
    sub_area: nullable(input.sub_area),
    daily_rate: input.daily_rate ?? null,
    working_hours: input.working_hours ?? null,
    date_started: nullable(input.date_started),
    eligibility: nullable(input.eligibility),
    recommended_by: nullable(input.recommended_by),
    remarks: nullable(input.remarks),
    remarks_2: nullable(input.remarks_2),
    has_atm: input.has_atm,
    // Enforced by chk_job_order_atm_account as well; clearing here keeps the
    // DB from rejecting an otherwise valid save.
    landbank_account_number: input.has_atm
      ? nullable(input.landbank_account_number)
      : null,
    sss_no: nullable(input.sss_no),
    sss_ss: input.sss_ss ?? null,
    sss_ec: input.sss_ec ?? null,
    community_tax_number: nullable(input.community_tax_number),
    community_tax_date: nullable(input.community_tax_date),
    community_tax_place_issued: nullable(input.community_tax_place_issued),
    status: input.status,
  };
}

export async function getJobOrderEmployees(
  filters: JobOrderFilters = {},
): Promise<JobOrderEmployee[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();

  // supabase/config.toml caps PostgREST's `max_rows` at 1000. This roster is
  // already ~578 legacy rows and growing, so a single unpaginated select
  // would silently truncate past the cap with no error once it grows past
  // it. Page through with `.range()` in chunks of 1000 (matching max_rows),
  // mirroring the pattern countEmployeesByArea already established in
  // job-order-area-actions.ts, instead of trusting one request to return
  // everything. `sort_name` alone does not uniquely order rows (surnames
  // collide), so `id` is added as a tiebreaker to keep page boundaries
  // stable — without it, ties straddling a page edge could be skipped or
  // duplicated across pages.
  const PAGE_SIZE = 1000;
  const rows: RawRow[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("hris")
      .from("job_order_employees")
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("sort_name", { nullsFirst: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.areaId) query = query.eq("area_id", filters.areaId);
    if (filters.hasAtm != null) query = query.eq("has_atm", filters.hasAtm);

    const { data, error } = await query;
    if (error) throw error;

    rows.push(...((data ?? []) as unknown as RawRow[]));

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.map(shape);
}

export async function getJobOrderEmployeeById(
  id: string,
): Promise<JobOrderEmployee | null> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? shape(data as unknown as RawRow) : null;
}

export async function createJobOrderEmployee(input: JobOrderEmployeeValues) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten();
    return {
      error:
        f.formErrors[0] ??
        Object.values(f.fieldErrors).flat()[0] ??
        "Invalid employee data",
    };
  }

  const supabase = createAdminClient();

  // An inactive area must not be assignable to a NEW record. Editing an
  // existing record whose area has since gone inactive stays allowed (see
  // updateJobOrderEmployee), so this check lives here only, not in update.
  const { data: area, error: areaError } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("is_active")
    .eq("id", parsed.data.area_id)
    .is("deleted_at", null)
    .maybeSingle();

  // Fail closed: if we can't verify the area's active status, refuse the
  // create rather than assuming it's fine (a discarded error here would
  // otherwise silently let an inactive/nonexistent area through).
  if (areaError) {
    return {
      error: `Could not verify the Area Assignment: ${areaError.message}`,
    };
  }
  if (!area) return { error: "Area Assignment not found" };
  if (!area.is_active) {
    return {
      error: "That Area Assignment is inactive and cannot be assigned",
    };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .insert({
      ...toRow(parsed.data),
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };

  const shaped = shape(data as unknown as RawRow);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_employees",
    recordId: shaped.id,
    newValues: { ...shaped },
  });

  revalidatePath("/job-orders");
  return { data: shaped };
}

export async function updateJobOrderEmployee(
  id: string,
  input: JobOrderEmployeeValues,
) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten();
    return {
      error:
        f.formErrors[0] ??
        Object.values(f.fieldErrors).flat()[0] ??
        "Invalid employee data",
    };
  }

  const supabase = createAdminClient();

  // Deliberately does NOT re-check the target area's active status the way
  // createJobOrderEmployee does. If it did, an employee whose area later
  // went inactive could never be edited again (every save would refuse the
  // now-inactive area_id), permanently locking the record. Inactive areas
  // must stay valid on employees that already reference them; they are only
  // barred from being newly assigned.
  const { data: before, error: beforeError } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  // Fail closed: a discarded error here would make a query failure look
  // identical to "record not found", and worse, would let the update below
  // proceed to compute a rate-history diff against nothing.
  if (beforeError) {
    return {
      error: `Could not load the existing record: ${beforeError.message}`,
    };
  }
  if (!before) return { error: "Employee not found" };

  const beforeShaped = shape(before as unknown as RawRow);

  // Preserve rate history the way the legacy system did: when the daily rate
  // changes, the old value moves to previous_daily_rate. Both sides of this
  // comparison are numbers (beforeShaped.daily_rate went through toNumber()
  // in shape()) — comparing the raw PostgREST string against the coerced
  // form value would make "400" !== 400 look like a change when it isn't.
  const rateChanged =
    (parsed.data.daily_rate ?? null) !== beforeShaped.daily_rate;

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .update({
      ...toRow(parsed.data),
      previous_daily_rate: rateChanged
        ? beforeShaped.daily_rate
        : beforeShaped.previous_daily_rate,
      updated_by: user!.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };

  const shaped = shape(data as unknown as RawRow);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_employees",
    recordId: id,
    oldValues: { ...beforeShaped },
    newValues: { ...shaped },
  });

  revalidatePath("/job-orders");
  return { data: shaped };
}

export async function deleteJobOrderEmployee(id: string) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_employees",
    recordId: id,
  });

  revalidatePath("/job-orders");
  return { success: true as const };
}
