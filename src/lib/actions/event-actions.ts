"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageEvents, canScanEvents, hasRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  EVENT_PAGE_SIZE,
  countOrphanedLegacyRows,
  loadCscTeams,
  loadEventCandidates,
} from "@/lib/event-repo";
import {
  eventManualAttendanceSchema,
  eventMetadataSchema,
  eventRosterBuildSchema,
  type EventManualAttendanceValues,
  type EventMetadataValues,
  type EventRosterBuildValues,
} from "@/lib/validations/event-schema";
import type {
  EventAttendanceRecord,
  EventCandidate,
  EventListRow,
  EventRecord,
  EventRosterEntry,
  EventStatus,
} from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

const EVENT_SELECT =
  "id, title, description, venue, start_date, end_date, status, closed_at, closed_by, created_at, updated_at, created_by, updated_by, deleted_at";

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getEvents(opts: {
  page?: number;
  status?: EventStatus | "all";
  search?: string | null;
}): Promise<{ rows: EventListRow[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.roles)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * EVENT_PAGE_SIZE;

  let query = supabase
    .schema("hris")
    .from("events")
    .select(EVENT_SELECT, { count: "exact" })
    .is("deleted_at", null);

  // The Attendance Checker is scan-only: a draft roster is still being
  // assembled and a closed event's report is final, so neither is his business.
  if (!canManageEvents(user?.roles)) {
    query = query.eq("status", "open");
  } else if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  if (opts.search) {
    query = query.ilike("title", `%${opts.search}%`);
  }

  const { data, count, error } = await query
    .order("start_date", { ascending: false })
    .range(from, from + EVENT_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const events = (data ?? []) as unknown as EventRecord[];
  const ids = events.map((e) => e.id);
  const [roster, attendance] = await Promise.all([
    countByEvent(supabase, "event_roster", ids),
    countByEvent(supabase, "event_attendance", ids),
  ]);

  return {
    rows: events.map((e) => ({
      ...e,
      roster_count: roster.get(e.id) ?? 0,
      attendance_count: attendance.get(e.id) ?? 0,
    })),
    totalCount: count ?? 0,
  };
}

/**
 * Per-event row counts in one round trip per table. Paged for the same reason
 * countMembers in job-order-memo-actions.ts is: a page of events each covering
 * a large roster can exceed PostgREST's 1000-row cap, and a silent truncation
 * would zero the counts of whichever events land past the cut.
 */
async function countByEvent(
  supabase: ReturnType<typeof createAdminClient>,
  table: "event_roster" | "event_attendance",
  eventIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;

  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from(table)
      .select("event_id")
      .in("event_id", eventIds)
      .order("event_id")
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { event_id: string }[];
    for (const r of rows) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }
  return counts;
}

export async function getEvent(id: string): Promise<EventRecord | null> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.roles)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const event = data as unknown as EventRecord;
  // Scan-only accounts never see a draft or a closed event.
  if (!canManageEvents(user?.roles) && event.status !== "open") return null;
  return event;
}

export async function getEventRoster(
  eventId: string,
): Promise<EventRosterEntry[]> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) return [];

  const supabase = createAdminClient();
  const out: EventRosterEntry[] = [];
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("event_roster")
      .select("*")
      .eq("event_id", eventId)
      .order("full_name")
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as EventRosterEntry[];
    out.push(...rows);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }
  return out;
}

export async function getEventAttendance(
  eventId: string,
): Promise<EventAttendanceRecord[]> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) return [];

  const supabase = createAdminClient();
  const out: EventAttendanceRecord[] = [];
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema("hris")
      .from("event_attendance")
      .select("*")
      .eq("event_id", eventId)
      .order("attendance_date")
      .order("full_name")
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as EventAttendanceRecord[];
    out.push(...rows);
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }

  // The team is not stored on the attendance row; it is read from the registry
  // so that fixing a wrong assignment moves the summary with it.
  const teams = await loadCscTeams(supabase, out);
  for (const row of out) {
    row.csc_team = teams.get(`${row.subject_kind}:${row.subject_id}`) ?? null;
  }
  return out;
}

/** Filter options for the roster builder and the card printing screen. */
export async function getEventGroupOptions(): Promise<{
  departments: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  orphanedLegacyCount: number;
}> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { departments: [], areas: [], orphanedLegacyCount: 0 };
  }

  const supabase = createAdminClient();
  const [depts, areas, orphans] = await Promise.all([
    supabase.schema("hris").from("departments").select("id, name").order("name"),
    supabase
      .schema("hris")
      .from("job_order_areas")
      .select("id, name")
      .order("name"),
    countOrphanedLegacyRows(supabase),
  ]);
  if (depts.error) throw new Error(depts.error.message);
  if (areas.error) throw new Error(areas.error.message);

  return {
    departments: (depts.data ?? []) as { id: string; name: string }[],
    areas: (areas.data ?? []) as { id: string; name: string }[],
    orphanedLegacyCount: orphans,
  };
}

/** Preview of who a set of roster filters would pull in. */
export async function previewEventCandidates(
  input: Omit<EventRosterBuildValues, "event_id">,
): Promise<EventCandidate[]> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) return [];

  const supabase = createAdminClient();
  return loadEventCandidates(supabase, {
    kinds: input.kinds,
    departmentIds: input.department_ids,
    areaIds: input.area_ids,
  });
}

// ── Writes ────────────────────────────────────────────────────────────────

export async function createEvent(
  values: EventMetadataValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const parsed = eventMetadataSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("events")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      venue: parsed.data.venue || null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create_event",
    tableName: "events",
    recordId: data.id,
    newValues: parsed.data,
  });

  revalidatePath("/events");
  return { success: true, data: { id: data.id } };
}

export async function updateEvent(
  id: string,
  values: EventMetadataValues,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const parsed = eventMetadataSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .schema("hris")
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .schema("hris")
    .from("events")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      venue: parsed.data.venue || null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update_event",
    tableName: "events",
    recordId: id,
    oldValues: before as Record<string, unknown> | null,
    newValues: parsed.data,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  return { success: true };
}

export async function setEventStatus(
  id: string,
  status: EventStatus,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const supabase = createAdminClient();

  if (status === "open") {
    // Opening an event with nobody on it would send the officer to the door
    // with an empty device: every scan would land as a walk-in and the offline
    // cache would hold nothing to resolve names against.
    const { count } = await supabase
      .schema("hris")
      .from("event_roster")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    if ((count ?? 0) === 0) {
      return {
        success: false,
        error: "Build the roster before opening the event for scanning.",
      };
    }
  }

  const { error } = await supabase
    .schema("hris")
    .from("events")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      closed_by: status === "closed" ? user!.id : null,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: `event_status_${status}`,
    tableName: "events",
    recordId: id,
    newValues: { status },
  });

  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  return { success: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  // Deleting an event takes its attendance record with it. Same gate as every
  // other destructive action in this codebase.
  if (!user || !hasRole(user.roles, "super_admin")) {
    return { success: false, error: "Not authorized" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("events")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete_event",
    tableName: "events",
    recordId: id,
  });

  revalidatePath("/events");
  return { success: true };
}

/**
 * Replaces the event's roster with whoever the filters currently select, and
 * SNAPSHOTS their name, number and department/area onto the roster row.
 *
 * The snapshot is the point: a hire, a transfer or a resignation after the fact
 * must not retroactively rewrite who was expected to attend, and a report
 * reprinted next quarter has to still match the one filed today.
 */
export async function buildEventRoster(
  values: EventRosterBuildValues,
): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const parsed = eventRosterBuildSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .schema("hris")
    .from("events")
    .select("id, status")
    .eq("id", parsed.data.event_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return { success: false, error: "Event not found" };
  if (event.status === "closed") {
    return { success: false, error: "This event is closed." };
  }

  const candidates = await loadEventCandidates(supabase, {
    kinds: parsed.data.kinds,
    departmentIds: parsed.data.department_ids,
    areaIds: parsed.data.area_ids,
  });

  const { error: delError } = await supabase
    .schema("hris")
    .from("event_roster")
    .delete()
    .eq("event_id", parsed.data.event_id);
  if (delError) return { success: false, error: delError.message };

  if (candidates.length > 0) {
    // Chunked: a full-LGU roster is several thousand rows and a single insert
    // would exceed the request body limit.
    const CHUNK = 500;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const { error } = await supabase
        .schema("hris")
        .from("event_roster")
        .insert(
          candidates.slice(i, i + CHUNK).map((c) => ({
            event_id: parsed.data.event_id,
            subject_kind: c.subject_kind,
            subject_id: c.subject_id,
            full_name: c.full_name,
            id_number: c.id_number,
            group_name: c.group_name,
            employment_label: c.employment_label,
          })),
        );
      if (error) return { success: false, error: error.message };
    }
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "build_event_roster",
    tableName: "event_roster",
    recordId: parsed.data.event_id,
    newValues: { ...parsed.data, count: candidates.length },
  });

  revalidatePath(`/events/${parsed.data.event_id}`);
  return { success: true, data: { count: candidates.length } };
}

/**
 * The officer marking someone present by name — forgotten card, unreadable QR,
 * a camera that will not focus in a dark gym. Allowed deliberately: an officer
 * who cannot record a real attendee will record them on paper and hand HR a
 * mess. Stamped method='manual' so HR can tell a scan from an assertion.
 */
export async function recordManualAttendance(
  values: EventManualAttendanceValues,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const parsed = eventManualAttendanceSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .schema("hris")
    .from("events")
    .select("id, status, start_date, end_date")
    .eq("id", parsed.data.event_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return { success: false, error: "Event not found" };

  // The same rule submitEventScans applies to a scan: a record cannot be filed
  // under a day the event did not run. Without this the manual sheet was the
  // one way past it — the scanner refuses the card and the officer falls back
  // to "No card", which used to go straight in.
  if (
    parsed.data.attendance_date < event.start_date ||
    parsed.data.attendance_date > event.end_date
  ) {
    return {
      success: false,
      error: `${parsed.data.attendance_date} is not one of this event's days.`,
    };
  }

  const { data: rosterRow } = await supabase
    .schema("hris")
    .from("event_roster")
    .select("full_name")
    .eq("event_id", parsed.data.event_id)
    .eq("subject_kind", parsed.data.subject_kind)
    .eq("subject_id", parsed.data.subject_id)
    .maybeSingle();
  if (!rosterRow) {
    return { success: false, error: "That person is not on this event's roster." };
  }

  const { error } = await supabase
    .schema("hris")
    .from("event_attendance")
    .insert({
      event_id: parsed.data.event_id,
      attendance_date: parsed.data.attendance_date,
      subject_kind: parsed.data.subject_kind,
      subject_id: parsed.data.subject_id,
      full_name: rosterRow.full_name,
      method: "manual",
      is_walk_in: false,
      scanned_at: new Date().toISOString(),
      synced_late: event.status === "closed",
      scanned_by: user!.id,
    });
  // 23505 = the one-per-person-per-day unique index. Already present is not an
  // error worth surfacing to someone standing at a door.
  if (error && error.code !== "23505") {
    return { success: false, error: error.message };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "event_manual_attendance",
    tableName: "event_attendance",
    recordId: parsed.data.event_id,
    newValues: parsed.data,
  });

  revalidatePath(`/events/${parsed.data.event_id}`);
  return { success: true };
}
