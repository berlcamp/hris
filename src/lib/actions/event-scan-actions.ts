"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageEvents, canScanEvents } from "@/lib/auth-helpers";
import { manilaDateOf } from "@/lib/format-date";
import { EMPLOYMENT_LABELS, resolveSubject } from "@/lib/event-repo";
import { eventScanBatchSchema, type EventScanBatchValues } from "@/lib/validations/event-schema";
import type {
  EventRecord,
  EventScanRosterEntry,
  EventSubjectKind,
  ScannableEvent,
} from "@/lib/types";

/** Per-scan outcome, returned so the device can clear its queue precisely. */
export type ScanOutcome =
  | "recorded"
  | "duplicate"
  | "unknown_token"
  | "out_of_range"
  | "error";

export interface ScanResult {
  client_scan_id: string;
  outcome: ScanOutcome;
  full_name: string | null;
  is_walk_in: boolean;
  synced_late: boolean;
  message?: string;
}

/**
 * The open events the checker's mobile app lists as cards.
 *
 * Only `open` events, for every role that can scan — including the HR admins,
 * who can cover a door without swapping accounts. A draft event has a roster
 * still being assembled and a closed one has a final report, so neither can be
 * scanned into from the app; the server would reject a draft scan anyway
 * (submitEventScans), and this keeps the door from ever seeing the card.
 *
 * THROWS for an unauthorized caller rather than returning []. An empty array is
 * a real answer — "HR has closed every event" — and the home screen acts on it
 * by clearing the list saved on the device. A session that lapsed while the
 * phone sat in a pocket must not be able to say that: the officer would walk
 * back into the venue to an empty app. Throwing sends the client to its cached
 * list instead. Nobody who cannot scan reaches this page anyway — the (scanner)
 * layout redirects them before it renders.
 */
export async function getScannableEvents(): Promise<ScannableEvent[]> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.role)) throw new Error("Not authorized");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("events")
    .select("id, title, description, venue, start_date, end_date, status")
    .eq("status", "open")
    .is("deleted_at", null)
    .order("start_date", { ascending: true });
  if (error) throw new Error(error.message);

  const events = (data ?? []) as unknown as Omit<
    ScannableEvent,
    "roster_count" | "attendance_today" | "counted_for"
  >[];
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const today = manilaDateOf(new Date());

  const [rosterCounts, todayCounts] = await Promise.all([
    countRows(supabase, "event_roster", ids, null),
    countRows(supabase, "event_attendance", ids, today),
  ]);

  return events.map((e) => ({
    ...e,
    roster_count: rosterCounts.get(e.id) ?? 0,
    attendance_today: todayCounts.get(e.id) ?? 0,
    counted_for: today,
  }));
}

/**
 * Per-event row counts in one paged round trip.
 *
 * Paged for the same reason countByEvent in event-actions.ts is: PostgREST caps
 * a response at 1000 rows, and a silent truncation would zero the counts of
 * whichever events landed past the cut.
 */
async function countRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: "event_roster" | "event_attendance",
  eventIds: string[],
  attendanceDate: string | null,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    let query = supabase
      .schema("hris")
      .from(table)
      .select("event_id")
      .in("event_id", eventIds);
    if (attendanceDate) query = query.eq("attendance_date", attendanceDate);

    const { data, error } = await query
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

/**
 * Everything the device needs to work offline: the event, and its roster joined
 * to each person's LIVE QR token.
 *
 * Scoped to THIS EVENT'S roster and nothing more. A phone at a barangay gym
 * carrying the tokens of every employee in the LGU would be a forgery kit; a
 * sixty-person seminar caches sixty tokens. That bound is the whole reason the
 * roster is materialized up front.
 *
 * The token is read live rather than snapshotted onto the roster row, so a card
 * reissued the morning of the event still works.
 */
export async function getEventScanPayload(eventId: string): Promise<{
  event: EventRecord;
  roster: EventScanRosterEntry[];
} | null> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.role)) return null;

  const supabase = createAdminClient();
  const { data: eventRow, error } = await supabase
    .schema("hris")
    .from("events")
    .select("*")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!eventRow) return null;

  const event = eventRow as unknown as EventRecord;
  if (!canManageEvents(user?.role) && event.status !== "open") return null;

  const roster: EventScanRosterEntry[] = [];
  const CHUNK = 1000;
  let from = 0;
  for (;;) {
    const { data, error: rErr } = await supabase
      .schema("hris")
      .from("event_roster")
      .select("subject_kind, subject_id, full_name, id_number, group_name, employment_label")
      .eq("event_id", eventId)
      .order("subject_id")
      .range(from, from + CHUNK - 1);
    if (rErr) throw new Error(rErr.message);
    const rows = (data ?? []) as unknown as Omit<EventScanRosterEntry, "token">[];
    roster.push(...rows.map((r) => ({ ...r, token: null as string | null })));
    if (rows.length < CHUNK) break;
    from += CHUNK;
  }

  // Live tokens, in id chunks so the .in() filter stays inside PostgREST's
  // URL length limits on a several-thousand-person roster.
  const byKey = new Map(roster.map((r) => [`${r.subject_kind}:${r.subject_id}`, r]));
  const ids = roster.map((r) => r.subject_id);
  const ID_CHUNK = 200;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error: cErr } = await supabase
      .schema("hris")
      .from("qr_credentials")
      .select("token, subject_kind, subject_id")
      .is("revoked_at", null)
      .in("subject_id", ids.slice(i, i + ID_CHUNK));
    if (cErr) throw new Error(cErr.message);
    for (const c of (data ?? []) as {
      token: string;
      subject_kind: EventSubjectKind;
      subject_id: string;
    }[]) {
      const entry = byKey.get(`${c.subject_kind}:${c.subject_id}`);
      if (entry) entry.token = c.token;
    }
  }

  return { event, roster };
}

/**
 * Records a batch of scans queued on the device.
 *
 * Every rule that makes the offline story survivable lives here:
 *  - `attendance_date` comes from the DEVICE clock, bucketed in Manila time, so
 *    a 23:58 scan synced next morning belongs to the day it happened.
 *  - `client_scan_id` is unique per event, so replaying a batch after a dropped
 *    connection is harmless.
 *  - A scan into a CLOSED event is accepted, not rejected, and stamped
 *    synced_late so the report shows it as an amendment rather than silently
 *    changing a total somebody already printed.
 *  - A token not on the roster is a walk-in, never a rejection: the officer at
 *    the door cannot debug a roster.
 */
export async function submitEventScans(
  values: EventScanBatchValues,
): Promise<{ success: true; results: ScanResult[] } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!canScanEvents(user?.role)) {
    return { success: false, error: "Not authorized" };
  }

  const parsed = eventScanBatchSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data: eventRow } = await supabase
    .schema("hris")
    .from("events")
    .select("id, status, start_date, end_date")
    .eq("id", parsed.data.event_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!eventRow) return { success: false, error: "Event not found" };
  const event = eventRow as { id: string; status: string; start_date: string; end_date: string };
  if (event.status === "draft") {
    return { success: false, error: "This event is not open for scanning yet." };
  }
  const syncedLate = event.status === "closed";

  const tokens = [...new Set(parsed.data.scans.map((s) => s.token.trim().toUpperCase()))];
  const credentials = new Map<string, { kind: EventSubjectKind; id: string }>();
  const TOKEN_CHUNK = 200;
  for (let i = 0; i < tokens.length; i += TOKEN_CHUNK) {
    const { data, error } = await supabase
      .schema("hris")
      .from("qr_credentials")
      .select("token, subject_kind, subject_id")
      .is("revoked_at", null)
      .in("token", tokens.slice(i, i + TOKEN_CHUNK));
    if (error) return { success: false, error: error.message };
    for (const c of (data ?? []) as {
      token: string;
      subject_kind: EventSubjectKind;
      subject_id: string;
    }[]) {
      credentials.set(c.token, { kind: c.subject_kind, id: c.subject_id });
    }
  }

  // Roster snapshot names, so a recorded scan reads the same as the roster.
  const roster = new Map<string, string>();
  {
    const CHUNK = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .schema("hris")
        .from("event_roster")
        .select("subject_kind, subject_id, full_name")
        .eq("event_id", parsed.data.event_id)
        .order("subject_id")
        .range(from, from + CHUNK - 1);
      if (error) return { success: false, error: error.message };
      const rows = (data ?? []) as {
        subject_kind: EventSubjectKind;
        subject_id: string;
        full_name: string;
      }[];
      for (const r of rows) roster.set(`${r.subject_kind}:${r.subject_id}`, r.full_name);
      if (rows.length < CHUNK) break;
      from += CHUNK;
    }
  }

  const results: ScanResult[] = [];

  for (const scan of parsed.data.scans) {
    const token = scan.token.trim().toUpperCase();
    const cred = credentials.get(token);
    if (!cred) {
      results.push({
        client_scan_id: scan.client_scan_id,
        outcome: "unknown_token",
        full_name: null,
        is_walk_in: false,
        synced_late: false,
        message: "Card not recognised. It may have been reissued.",
      });
      continue;
    }

    const attendanceDate = manilaDateOf(scan.scanned_at);
    if (attendanceDate < event.start_date || attendanceDate > event.end_date) {
      // A device with a badly wrong clock. Refused rather than silently filed
      // under a day the event did not run — the officer sees it and can fall
      // back to a manual entry.
      results.push({
        client_scan_id: scan.client_scan_id,
        outcome: "out_of_range",
        full_name: null,
        is_walk_in: false,
        synced_late: false,
        message: `Scan dated ${attendanceDate} falls outside the event.`,
      });
      continue;
    }

    const key = `${cred.kind}:${cred.id}`;
    let fullName = roster.get(key) ?? null;
    const isWalkIn = fullName === null;
    if (fullName === null) {
      const subject = await resolveSubject(supabase, cred.kind, cred.id);
      fullName = subject?.full_name ?? `Unknown ${EMPLOYMENT_LABELS[cred.kind]}`;
    }

    const { error } = await supabase
      .schema("hris")
      .from("event_attendance")
      .insert({
        event_id: parsed.data.event_id,
        attendance_date: attendanceDate,
        subject_kind: cred.kind,
        subject_id: cred.id,
        full_name: fullName,
        method: "scan",
        is_walk_in: isWalkIn,
        scanned_at: scan.scanned_at,
        synced_late: syncedLate,
        client_scan_id: scan.client_scan_id,
        qr_token: token,
        scanned_by: user!.id,
      });

    if (error) {
      // 23505 covers both unique indexes: already present for that day, or a
      // replayed client_scan_id. Neither is a failure — the device should drop
      // the queued scan either way.
      if (error.code === "23505") {
        results.push({
          client_scan_id: scan.client_scan_id,
          outcome: "duplicate",
          full_name: fullName,
          is_walk_in: isWalkIn,
          synced_late: false,
        });
        continue;
      }
      results.push({
        client_scan_id: scan.client_scan_id,
        outcome: "error",
        full_name: fullName,
        is_walk_in: isWalkIn,
        synced_late: false,
        message: error.message,
      });
      continue;
    }

    results.push({
      client_scan_id: scan.client_scan_id,
      outcome: "recorded",
      full_name: fullName,
      is_walk_in: isWalkIn,
      synced_late: syncedLate,
    });
  }

  revalidatePath(`/events/${parsed.data.event_id}`);
  return { success: true, results };
}
