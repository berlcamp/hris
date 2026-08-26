import type { createAdminClient } from "@/lib/supabase/admin";
import { formatEmployeeDisplayName } from "@/lib/employee-name-match";
import type { EventCandidate, EventSubjectKind } from "@/lib/types";

// Page sizes live here rather than in the actions file: a `"use server"` module
// may only export async functions, so a plain `export const` there is a build
// error — and the list client needs the same number to compute its page count.
export const EVENT_PAGE_SIZE = 20;

/** PostgREST caps a single response at 1000 rows; registry reads page past it. */
const REGISTRY_CHUNK = 1000;

export const EMPLOYMENT_LABELS: Record<EventSubjectKind, string> = {
  employee: "Plantilla",
  job_order: "Job Order",
  cos: "COS",
};

/**
 * What "filtered by department" means for each registry.
 *
 * Job Order personnel have NO department: job_order_employees carries
 * `area_id → job_order_areas` and nothing else. Rather than add a
 * `department_id` column nobody would backfill — which would give HR a filter
 * that silently returns zero rows and reads as a bug — the filter axis changes
 * meaning per registry, and the UI says so.
 */
export const GROUP_AXIS: Record<EventSubjectKind, "department" | "area"> = {
  employee: "department",
  job_order: "area",
  cos: "department",
};

// The service-role client every server action in this module uses.
type Db = ReturnType<typeof createAdminClient>;

/** Reads every page of a PostgREST query built by `build`, ordered by `id`. */
async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + REGISTRY_CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < REGISTRY_CHUNK) break;
    from += REGISTRY_CHUNK;
  }
  return out;
}

interface PlantillaRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  employee_no: string | null;
  department_id: string | null;
  departments: { name: string } | null;
}

interface JobOrderRow {
  id: string;
  full_name: string;
  area_id: string | null;
  job_order_areas: { name: string } | null;
}

interface CosRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  cos_no: string | null;
  department_id: string | null;
  departments: { name: string } | null;
}

/**
 * Everyone eligible to be put on a roster or handed a QR card, across all three
 * registries, optionally narrowed to specific groups.
 *
 * `groupIds` are department ids for plantilla/COS and AREA ids for Job Order —
 * see GROUP_AXIS. Passing an empty array means "no filter", not "nothing".
 *
 * Rows sitting in hris.employees with employment_type in ('jo','cos') are
 * deliberately NOT returned: Job Order and COS personnel come from their own
 * registries. Those legacy rows are orphans, and countOrphanedLegacyRows()
 * exists so the gap is reported rather than silently swallowed.
 */
export async function loadEventCandidates(
  supabase: Db,
  opts: {
    kinds: EventSubjectKind[];
    departmentIds?: string[];
    areaIds?: string[];
  },
): Promise<EventCandidate[]> {
  const out: EventCandidate[] = [];
  const wantDept = opts.departmentIds ?? [];
  const wantArea = opts.areaIds ?? [];

  if (opts.kinds.includes("employee")) {
    const rows = await readAll<PlantillaRow>((from, to) => {
      let q = supabase
        .schema("hris")
        .from("employees")
        .select(
          "id, first_name, middle_name, last_name, suffix, employee_no, department_id, departments!employees_department_id_fkey(name)",
        )
        .eq("employment_type", "plantilla")
        .eq("status", "active");
      if (wantDept.length > 0) q = q.in("department_id", wantDept);
      return q.order("id").range(from, to);
    });
    for (const r of rows) {
      out.push({
        subject_kind: "employee",
        subject_id: r.id,
        full_name: formatEmployeeDisplayName(r),
        id_number: r.employee_no,
        group_name: r.departments?.name ?? null,
        group_id: r.department_id,
        employment_label: EMPLOYMENT_LABELS.employee,
      });
    }
  }

  if (opts.kinds.includes("job_order")) {
    const rows = await readAll<JobOrderRow>((from, to) => {
      let q = supabase
        .schema("hris")
        .from("job_order_employees")
        .select("id, full_name, area_id, job_order_areas(name)")
        .eq("status", "active")
        .is("deleted_at", null);
      if (wantArea.length > 0) q = q.in("area_id", wantArea);
      return q.order("id").range(from, to);
    });
    for (const r of rows) {
      out.push({
        subject_kind: "job_order",
        subject_id: r.id,
        full_name: r.full_name,
        // No number of any kind exists in this registry. The printed card falls
        // back to the tail of the QR token so every card carries something a
        // human can read back over a phone.
        id_number: null,
        group_name: r.job_order_areas?.name ?? null,
        group_id: r.area_id,
        employment_label: EMPLOYMENT_LABELS.job_order,
      });
    }
  }

  if (opts.kinds.includes("cos")) {
    const rows = await readAll<CosRow>((from, to) => {
      let q = supabase
        .schema("hris")
        .from("cos_employees")
        .select(
          "id, first_name, middle_name, last_name, suffix, cos_no, department_id, departments(name)",
        )
        .eq("status", "active")
        .is("deleted_at", null);
      if (wantDept.length > 0) q = q.in("department_id", wantDept);
      return q.order("id").range(from, to);
    });
    for (const r of rows) {
      out.push({
        subject_kind: "cos",
        subject_id: r.id,
        full_name: formatEmployeeDisplayName(r),
        id_number: r.cos_no,
        group_name: r.departments?.name ?? null,
        group_id: r.department_id,
        employment_label: EMPLOYMENT_LABELS.cos,
      });
    }
  }

  out.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return out;
}

/**
 * How many Job Order / COS rows are stranded in hris.employees and therefore
 * invisible to this module. Surfaced on the roster screen so an empty-looking
 * result is explained rather than mistaken for a bug — and so the data-cleanup
 * job stays on somebody's list.
 */
export async function countOrphanedLegacyRows(supabase: Db): Promise<number> {
  const { count, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id", { count: "exact", head: true })
    .in("employment_type", ["jo", "cos"])
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Resolves display details for one subject, for walk-in scans. */
export async function resolveSubject(
  supabase: Db,
  kind: EventSubjectKind,
  id: string,
): Promise<EventCandidate | null> {
  const all = await loadEventCandidates(supabase, { kinds: [kind] });
  return all.find((c) => c.subject_id === id) ?? null;
}
