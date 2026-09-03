import type { createAdminClient } from "@/lib/supabase/admin";
import { formatEmployeeDisplayName } from "@/lib/employee-name-match";
import { idText } from "@/lib/id-text";
import type {
  EventCandidate,
  EventSubjectKind,
  PriorParticipation,
} from "@/lib/types";

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
  temporary: "Temporary",
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
export const GROUP_AXIS: Record<
  EventSubjectKind,
  "department" | "area" | "none"
> = {
  employee: "department",
  job_order: "area",
  cos: "department",
  // A temporary record is a name and nothing else — it carries no department
  // worth filtering on, so the group filters simply do not apply to it.
  temporary: "none",
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
  // Typed loosely on purpose — see idText(). employee_no comes back as a number
  // from the production database.
  id_number: string | number | null;
  employee_no: string | number | null;
  department_id: string | null;
  departments: { name: string } | null;
}

interface TemporaryRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
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
  cos_no: string | number | null;
  department_id: string | null;
  departments: { name: string } | null;
}

/**
 * Everyone eligible to be put on a roster or handed a QR card, across every
 * registry, optionally narrowed to specific groups.
 *
 * `groupIds` are department ids for plantilla/COS and AREA ids for Job Order —
 * see GROUP_AXIS. Passing an empty array means "no filter", not "nothing".
 * Temporary personnel are on neither axis and are never narrowed by either.
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
          "id, first_name, middle_name, last_name, suffix, id_number, employee_no, department_id, departments!employees_department_id_fkey(name)",
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
        // id_number is the human-assigned ID people actually recognise
        // ("CSWD-1576"); employee_no is a bare internal counter ("1964") and
        // is only a fallback. Same field the public employee QR keys on — see
        // src/lib/employee-qr.ts.
        id_number: idText(r.id_number) ?? idText(r.employee_no),
        group_name: r.departments?.name ?? null,
        group_id: r.department_id,
        employment_label: EMPLOYMENT_LABELS.employee,
      });
    }
  }

  if (opts.kinds.includes("temporary")) {
    // Deliberately NOT narrowed by departmentIds. A temporary record is just a
    // name; most carry no department at all, so applying the department filter
    // would quietly drop every one of them the moment HR ticked a department
    // to narrow the plantilla side of the same roster.
    const rows = await readAll<TemporaryRow>((from, to) =>
      supabase
        .schema("hris")
        .from("employees")
        .select("id, first_name, middle_name, last_name, suffix")
        .eq("employment_type", "temporary")
        .eq("status", "active")
        .order("id")
        .range(from, to),
    );
    for (const r of rows) {
      out.push({
        subject_kind: "temporary",
        subject_id: r.id,
        full_name: formatEmployeeDisplayName(r),
        id_number: null,
        group_name: null,
        group_id: null,
        employment_label: EMPLOYMENT_LABELS.temporary,
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
        id_number: idText(r.cos_no),
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
 * The CSC team of each attendee, keyed "kind:id".
 *
 * Read LIVE from the registries rather than snapshotted onto the roster or the
 * attendance row. Unlike a name or a department — which the roster freezes so a
 * reprinted report keeps matching the one filed last month — a team is a
 * correction waiting to happen: somebody is put in the wrong group, HR fixes
 * the assignment, and the totals have to move with it. Freezing it would mean
 * the summary keeps reporting the mistake.
 *
 * 'employee' and 'temporary' are both hris.employees rows, so they resolve in
 * one query.
 */
export async function loadCscTeams(
  supabase: Db,
  refs: { subject_kind: EventSubjectKind; subject_id: string }[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (refs.length === 0) return out;

  const tables: Record<EventSubjectKind, string> = {
    employee: "employees",
    temporary: "employees",
    job_order: "job_order_employees",
    cos: "cos_employees",
  };

  // One read per TABLE, not per kind — employee and temporary share one.
  const idsByTable = new Map<string, Set<string>>();
  for (const r of refs) {
    const table = tables[r.subject_kind];
    if (!table) continue;
    if (!idsByTable.has(table)) idsByTable.set(table, new Set());
    idsByTable.get(table)!.add(r.subject_id);
  }

  const teamById = new Map<string, string | null>();
  const ID_CHUNK = 200;
  for (const [table, idSet] of idsByTable) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await supabase
        .schema("hris")
        .from(table)
        .select("id, csc_team")
        .in("id", ids.slice(i, i + ID_CHUNK));
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as { id: string; csc_team: string | null }[]) {
        teamById.set(row.id, row.csc_team);
      }
    }
  }

  for (const r of refs) {
    out.set(
      `${r.subject_kind}:${r.subject_id}`,
      teamById.get(r.subject_id) ?? null,
    );
  }
  return out;
}

/**
 * Where each of these people has already been counted at ANOTHER event flagged
 * exclusive_participation — the "one event only" lookup behind the door warning.
 *
 * Returns an empty map unless `eventId` is itself flagged: the rule is
 * symmetric, and an unflagged event is an ordinary one whose officer should
 * never be told anything about other events at all.
 *
 * Keyed `${kind}:${id}` like every other cross-registry map in this module,
 * because the three person registries share no key.
 *
 * The EARLIEST appearance wins when somebody has managed to be counted at
 * several. That is the one that used up the entitlement; naming a later
 * duplicate would send HR to the wrong event to unpick it.
 */
export async function loadPriorExclusiveParticipation(
  supabase: Db,
  eventId: string,
  refs: { subject_kind: EventSubjectKind; subject_id: string }[],
): Promise<Map<string, PriorParticipation>> {
  const out = new Map<string, PriorParticipation>();
  if (refs.length === 0) return out;

  const { data: eventRow, error: eventError } = await supabase
    .schema("hris")
    .from("events")
    .select("id, exclusive_participation")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  if (!eventRow || !(eventRow as { exclusive_participation: boolean }).exclusive_participation) {
    return out;
  }

  const { data: others, error: othersError } = await supabase
    .schema("hris")
    .from("events")
    .select("id, title")
    .eq("exclusive_participation", true)
    .neq("id", eventId)
    .is("deleted_at", null);
  if (othersError) throw new Error(othersError.message);

  const titleById = new Map(
    ((others ?? []) as { id: string; title: string }[]).map((e) => [e.id, e.title]),
  );
  if (titleById.size === 0) return out;

  // Asked subject-first and in id chunks, so the request stays inside
  // PostgREST's URL limits on a several-thousand-person roster and the answer
  // covers only the people actually being looked up.
  const wanted = new Set(refs.map((r) => `${r.subject_kind}:${r.subject_id}`));
  const ids = [...new Set(refs.map((r) => r.subject_id))];
  const otherIds = [...titleById.keys()];
  const ID_CHUNK = 200;

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += REGISTRY_CHUNK) {
      const { data, error } = await supabase
        .schema("hris")
        .from("event_attendance")
        .select("event_id, attendance_date, subject_kind, subject_id")
        .in("event_id", otherIds)
        .in("subject_id", slice)
        .order("attendance_date")
        .range(from, from + REGISTRY_CHUNK - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as {
        event_id: string;
        attendance_date: string;
        subject_kind: EventSubjectKind;
        subject_id: string;
      }[];

      for (const row of rows) {
        const key = `${row.subject_kind}:${row.subject_id}`;
        if (!wanted.has(key)) continue;
        const title = titleById.get(row.event_id);
        if (!title) continue;
        const existing = out.get(key);
        if (existing && existing.attendance_date <= row.attendance_date) continue;
        out.set(key, {
          event_id: row.event_id,
          event_title: title,
          attendance_date: row.attendance_date,
        });
      }
      if (rows.length < REGISTRY_CHUNK) break;
    }
  }

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
