"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  canDirectApplyAttendanceCorrection,
  canFileAttendanceCorrection,
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";
import {
  correctionRequestSchema,
  type CorrectionRequestInput,
} from "@/lib/validations/attendance-correction-schema";
import {
  buildCorrectionRecord,
  datesInRange,
  dayOfWeekFor,
  resolveItemSchedules,
  type ResolvedItemSchedule,
} from "@/lib/attendance-corrections";
import {
  DEFAULT_SCHEDULE,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import type { CorrectionReason } from "@/lib/constants";

const PROOF_BUCKET = "attendance-proofs";
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Columns compared by the apply-time drift check. Keep in sync with migration 067. */
function snapshotOf(log: Record<string, unknown>) {
  return {
    time_in_am: log.time_in_am ?? null,
    time_out_am: log.time_out_am ?? null,
    time_in_pm: log.time_in_pm ?? null,
    time_out_pm: log.time_out_pm ?? null,
    schedule_id: log.schedule_id ?? null,
    source: log.source ?? null,
  };
}

export interface CorrectableEmployee {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  biometric_no: number | null;
}

// Employees this user may correct.
//
// Direct-apply roles (HR / DTR / OCM) reach every ACTIVE employee, with no
// eligibility flag and no department scoping — they are the authority that sets
// the flag in the first place, and this call replaces the manual-entry picker,
// which has always reached everyone.
//
// Department Admins are scoped twice over: the employee must be flagged
// eligible AND their EFFECTIVE department (detailed_department_id ??
// department_id) must be the caller's own. Exclusive, not additive — an
// employee detailed away belongs to the department that supervises the duty,
// which is also who signs their DTR.
export async function getCorrectableEmployees(): Promise<CorrectableEmployee[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const direct = canDirectApplyAttendanceCorrection(user.role);
  if (!direct && (!canRequestAttendanceCorrection(user.role) || !user.departmentId)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("employees")
    .select("id, first_name, last_name, biometric_no, department_id, detailed_department_id")
    .eq("status", "active")
    .order("last_name");

  if (!direct) {
    query = query
      .eq("attendance_correction_eligible", true)
      .or(
        `detailed_department_id.eq.${user.departmentId},` +
          `and(detailed_department_id.is.null,department_id.eq.${user.departmentId})`,
      );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id as string,
    name: `${e.last_name}, ${e.first_name}`,
    first_name: e.first_name as string,
    last_name: e.last_name as string,
    biometric_no: (e.biometric_no as number | null) ?? null,
  }));
}

/** Throws unless `employeeId` is within the caller's correction reach. */
async function assertReach(employeeId: string) {
  const allowed = await getCorrectableEmployees();
  if (!allowed.some((e) => e.id === employeeId)) {
    throw new Error("Unauthorized");
  }
}

export interface CorrectionDraftDay {
  /** The attendance_logs row id, or null when the date has no row yet. */
  id: string | null;
  date: string;
  /** 0 = Sunday. Server-computed so the grid's weekend defaults do not depend
   *  on the browser's timezone. */
  day_of_week: number;
  /** False when nothing was ever recorded for this date — the item will CREATE
   *  the day rather than update it. */
  has_record: boolean;
  schedule_id: string | null;
  /** HH:MM, extracted from the stored TIMESTAMPTZ — see hhmmOf below. */
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  time_in_am_reason: string | null;
  time_out_am_reason: string | null;
  time_in_pm_reason: string | null;
  time_out_pm_reason: string | null;
  late_minutes: number;
  undertime_minutes: number;
  is_absent: boolean;
  source: string | null;
  correction_locked: boolean;
}

// The prefilled grid: one row per date in the range, whether or not an
// attendance row exists for it. Dates with no row come back with
// `has_record: false` and a null id — picking one files an item that CREATES
// the day (migration 067), which is how a weekend the employee worked but the
// biometric never captured gets onto the DTR.
//
// Times come back as HH:MM rather than raw TIMESTAMPTZ, matching what
// getAttendanceLogs already returns to the manual-entry form. The grid is an
// editor over wall-clock values; handing it timestamps would make every
// consumer re-derive the same HH:MM. This does NOT feed the drift snapshot —
// createCorrectionRequest re-reads the raw rows for that.
export async function getCorrectionDraftDays(
  employeeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<CorrectionDraftDay[]> {
  await assertReach(employeeId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "id, date, schedule_id, time_in_am, time_out_am, time_in_pm, time_out_pm, " +
        "time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason, " +
        "late_minutes, undertime_minutes, is_absent, source, correction_locked",
    )
    .eq("employee_id", employeeId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date");
  if (error) throw error;
  // The admin client is untyped and the select list is built by concatenation,
  // so PostgREST's row type does not survive to here — same reason
  // listCorrectionRequests casts. The shape is the select list above.
  const rows = (data ?? []) as unknown as {
    id: string;
    date: string;
    schedule_id: string | null;
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    time_in_am_reason: string | null;
    time_out_am_reason: string | null;
    time_in_pm_reason: string | null;
    time_out_pm_reason: string | null;
    late_minutes: number | null;
    undertime_minutes: number | null;
    is_absent: boolean | null;
    source: string | null;
    correction_locked: boolean | null;
  }[];
  const byDate = new Map(rows.map((r) => [r.date, r]));

  // Walk the calendar, not the query result: a date with no attendance row is
  // exactly the case this grid now has to offer.
  return datesInRange(dateFrom, dateTo).map((date) => {
    const row = byDate.get(date);
    const day_of_week = dayOfWeekFor(date);
    if (!row) {
      return {
        id: null,
        date,
        day_of_week,
        has_record: false,
        schedule_id: null,
        time_in_am: null,
        time_out_am: null,
        time_in_pm: null,
        time_out_pm: null,
        time_in_am_reason: null,
        time_out_am_reason: null,
        time_in_pm_reason: null,
        time_out_pm_reason: null,
        // Nothing was recorded, so nothing is currently being charged. This is
        // NOT the same as is_absent: an absence is a recorded judgement about a
        // duty day, whereas a missing row is the absence of any record at all.
        late_minutes: 0,
        undertime_minutes: 0,
        is_absent: false,
        source: null,
        correction_locked: false,
      };
    }
    return {
      ...row,
      day_of_week,
      has_record: true,
      time_in_am: hhmmOf(row.time_in_am),
      time_out_am: hhmmOf(row.time_out_am),
      time_in_pm: hhmmOf(row.time_in_pm),
      time_out_pm: hhmmOf(row.time_out_pm),
      late_minutes: row.late_minutes ?? 0,
      undertime_minutes: row.undertime_minutes ?? 0,
      is_absent: !!row.is_absent,
      correction_locked: !!row.correction_locked,
    };
  });
}

export async function createCorrectionRequest(
  input: CorrectionRequestInput,
  proof: FormData,
) {
  const user = await getCurrentUser();
  if (!user || !canFileAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  // Whether this filing applies on submit or waits for a reviewer is decided
  // HERE, from the caller's role — never from anything the client sends.
  const directApply = canDirectApplyAttendanceCorrection(user.role);
  const parsed = correctionRequestSchema.parse(input);
  await assertReach(parsed.employee_id);

  // Proof is mandatory for a department filing and optional for direct-apply:
  // the document is what lets HR trust an assertion it cannot verify, and a
  // reviewer-level role filing directly is the party that would have judged it.
  // Migration 068's acr_proof_unless_direct enforces the same rule in the
  // schema, so this cannot be bypassed by calling the action directly.
  const file = proof.get("proof");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !directApply) {
    throw new Error("A supporting document is required");
  }
  if (hasFile) {
    if (file.size > MAX_PROOF_BYTES) {
      throw new Error("The supporting document must be 10 MB or smaller");
    }
    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      throw new Error("The supporting document must be a PDF, JPEG or PNG");
    }
  }

  const supabase = createAdminClient();

  // Effective department, snapshot at submit time so a later re-detail does not
  // orphan the request.
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("department_id, detailed_department_id")
    .eq("id", parsed.employee_id)
    .single();
  const departmentId = emp?.detailed_department_id ?? emp?.department_id ?? null;

  // Snapshot every targeted row BEFORE inserting, so the drift check has a
  // baseline taken at the same moment the requester saw the data. Items with a
  // null attendance_log_id are CREATE items — there is no row to snapshot, and
  // their drift rule is "has a row appeared since?", checked at apply time.
  const logIds = parsed.items
    .map((i) => i.attendance_log_id)
    .filter((v): v is string => !!v);
  const { data: logs, error: logErr } =
    logIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .schema("hris")
          .from("attendance_logs")
          .select("id, time_in_am, time_out_am, time_in_pm, time_out_pm, schedule_id, source")
          .in("id", logIds);
  if (logErr) throw logErr;
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));
  if (byId.size !== logIds.length) {
    throw new Error("Some of those days no longer have an attendance record");
  }

  // A CREATE item is only valid while the date really has no row. Re-check here
  // rather than trusting the grid the requester loaded, which may be minutes
  // old. The same check runs again inside apply_attendance_correction, because
  // an import can land between submitting and approving.
  const createDates = parsed.items
    .filter((i) => !i.attendance_log_id)
    .map((i) => i.duty_date);
  if (createDates.length > 0) {
    const { data: clashes, error: clashErr } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("date")
      .eq("employee_id", parsed.employee_id)
      .in("date", createDates);
    if (clashErr) throw clashErr;
    if ((clashes ?? []).length > 0) {
      throw new Error(
        "Attendance was recorded for one of those days while you were filling this in. Reload and try again.",
      );
    }
  }

  // Upload first: a failed upload must not leave a request row behind.
  const requestId = crypto.randomUUID();
  const path = hasFile ? `${parsed.employee_id}/${requestId}/${file.name}` : null;
  if (hasFile && path) {
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(`Could not upload the proof: ${uploadError.message}`);
  }

  const { error: reqError } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .insert({
      id: requestId,
      employee_id: parsed.employee_id,
      department_id: departmentId,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      reason: parsed.reason,
      direct_apply: directApply,
      proof_path: path,
      proof_filename: hasFile ? file.name : null,
      proof_mime: hasFile ? file.type : null,
      proof_size: hasFile ? file.size : null,
      requested_by: user.id,
      requested_by_email: user.email,
    });
  if (reqError) {
    if (path) await supabase.storage.from(PROOF_BUCKET).remove([path]);
    // The EXCLUDE constraint is the likely cause; say so in plain language.
    if (reqError.message.includes("acr_no_overlapping_pending")) {
      throw new Error(
        "This employee already has a correction request covering some of those dates",
      );
    }
    throw reqError;
  }

  const { error: itemError } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .insert(
      parsed.items.map((i) => ({
        request_id: requestId,
        duty_date: i.duty_date,
        attendance_log_id: i.attendance_log_id,
        disposition: i.disposition,
        proposed_schedule_id: i.proposed_schedule_id,
        proposed_time_in_am: i.time_in_am,
        proposed_time_out_am: i.time_out_am,
        proposed_time_in_pm: i.time_in_pm,
        proposed_time_out_pm: i.time_out_pm,
        proposed_in_am_reason: i.reason_in_am,
        proposed_out_am_reason: i.reason_out_am,
        proposed_in_pm_reason: i.reason_in_pm,
        proposed_out_pm_reason: i.reason_out_pm,
        // `before` is NOT NULL. A CREATE item has no prior row, and an empty
        // object is the honest snapshot of "nothing was there" — the apply
        // function never compares it, keying off the null attendance_log_id.
        before: i.attendance_log_id
          ? snapshotOf(byId.get(i.attendance_log_id)!)
          : {},
      })),
    );
  if (itemError) {
    // The request row above already committed and, being 'pending', holds
    // the acr_no_overlapping_pending exclusivity lock on these dates. Leaving
    // it behind (e.g. two items sharing a duty_date, which fails only the
    // items insert via the UNIQUE (request_id, duty_date) constraint) would
    // block every future request for this employee's range with no way for
    // the caller to find and cancel it — the id is never returned on this
    // path. Compensate by deleting the request (items cascade, though none
    // were committed) and the uploaded proof before rethrowing.
    await supabase
      .schema("hris")
      .from("attendance_correction_requests")
      .delete()
      .eq("id", requestId);
    if (path) await supabase.storage.from(PROOF_BUCKET).remove([path]);
    throw itemError;
  }

  // Direct-apply: commit the days now, through the same code an approving
  // reviewer runs. The request row exists and is briefly 'pending', so the
  // drift checks and the transactional RPC behave identically — the only
  // difference is that nobody else had to press Approve.
  //
  // If this leaves the request live (a needs_rebase outcome, or a throw), that
  // is deliberately NOT rolled back: the row stays visible in the list as a
  // pending request the filer can retry or withdraw, rather than vanishing
  // with the days silently unwritten.
  let outcome: "applied" | "needs_rebase" | null = null;
  if (directApply) {
    outcome = await applyCorrectionItems(supabase, requestId, parsed.employee_id, {
      id: user.id,
      email: user.email,
    });
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: directApply
      ? "attendance_correction_direct_applied"
      : "attendance_correction_requested",
    tableName: "attendance_correction_requests",
    recordId: requestId,
    newValues: {
      employee_id: parsed.employee_id,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      days: parsed.items.length,
      direct_apply: directApply,
      has_proof: hasFile,
      ...(outcome ? { outcome } : {}),
    },
  });

  revalidatePath("/attendance-corrections");
  if (directApply) revalidatePath("/attendance");
  return { id: requestId, directApply, outcome };
}

export type CorrectionRequestStatus =
  | "pending"
  | "needs_rebase"
  | "approved"
  | "rejected"
  | "cancelled";

export interface CorrectionRequestListRow {
  id: string;
  employee_id: string;
  department_id: string | null;
  date_from: string;
  date_to: string;
  reason: string;
  status: CorrectionRequestStatus;
  /** Filed by a reviewer-level role and applied on submit — see migration 068. */
  direct_apply: boolean;
  /** Null when a direct-apply filing carried no supporting document. */
  proof_filename: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  applied_at: string | null;
  employees: { first_name: string; last_name: string } | null;
  departments: { code: string | null; name: string } | null;
}

export async function listCorrectionRequests(): Promise<
  CorrectionRequestListRow[]
> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("attendance_correction_requests")
    // Kept as ONE string literal, not a concatenation: supabase-js parses the
    // select list from the literal type, and a concatenated string collapses
    // to `string`, which degrades every downstream row type to
    // GenericStringError. Same reason the other selects in this file are long
    // single lines.
    .select("*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name), departments(code, name)")
    .order("requested_at", { ascending: false });

  if (canReviewAttendanceCorrection(user.role)) {
    // Reviewers see everything.
  } else if (canRequestAttendanceCorrection(user.role) && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  } else {
    throw new Error("Unauthorized");
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CorrectionRequestListRow[];
}

export interface CorrectionItemRow {
  id: string;
  request_id: string;
  duty_date: string;
  /** Null when the item creates the day — see migration 067. */
  attendance_log_id: string | null;
  disposition: "update" | "clear_as_off";
  proposed_schedule_id: string | null;
  /** HH:MM:SS out of the TIME columns. */
  proposed_time_in_am: string | null;
  proposed_time_out_am: string | null;
  proposed_time_in_pm: string | null;
  proposed_time_out_pm: string | null;
  proposed_in_am_reason: string | null;
  proposed_out_am_reason: string | null;
  proposed_in_pm_reason: string | null;
  proposed_out_pm_reason: string | null;
  /** Raw attendance_logs snapshot taken at submit time; drives the diff. */
  before: {
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    schedule_id: string | null;
    source: string | null;
  };
}

export async function getCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name), departments(code, name)")
    .eq("id", id)
    .single();
  if (error) throw error;

  const isReviewer = canReviewAttendanceCorrection(user.role);
  const isOwnDept =
    canRequestAttendanceCorrection(user.role) &&
    !!user.departmentId &&
    request.department_id === user.departmentId;
  if (!isReviewer && !isOwnDept) throw new Error("Unauthorized");

  const { data: items } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", id)
    .order("duty_date");

  // Private bucket — never a public URL. A direct-apply filing may carry no
  // proof at all (migration 068), in which case there is nothing to sign.
  const proofPath = request.proof_path as string | null;
  const { data: signed } = proofPath
    ? await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUrl(proofPath, 60 * 10)
    : { data: null };

  return {
    request: request as unknown as CorrectionRequestListRow & {
      proof_path: string | null;
      proof_mime: string | null;
      proof_size: number | null;
    },
    items: (items ?? []) as unknown as CorrectionItemRow[],
    proofUrl: signed?.signedUrl ?? null,
  };
}

export async function cancelCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("department_id, status")
    .eq("id", id)
    .single();
  if (!existing || !user.departmentId || existing.department_id !== user.departmentId) {
    throw new Error("Unauthorized");
  }
  if (!["pending", "needs_rebase"].includes(existing.status)) {
    throw new Error("Only a live request can be withdrawn");
  }

  const { error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_cancelled",
    tableName: "attendance_correction_requests",
    recordId: id,
  });
  revalidatePath("/attendance-corrections");
}

/** HH:MM out of a stored TIME column. Mirrors extractTime in attendance-actions.ts. */
function hhmmOf(ts: string | null): string | null {
  return ts?.match(/(\d{2}:\d{2})/)?.[1] ?? null;
}

// Batch-fetches everything resolveItemSchedules (attendance-corrections.ts)
// needs — the employee's own schedule, each item's row-level pin (via its
// attendance_log's schedule_id), and every schedule either might reference —
// in three queries regardless of how many items the request has, then hands
// off to the pure resolver. approveCorrectionRequest and
// getCorrectionReviewSummary both call ONLY this for schedule resolution, so
// the minutes HR reviews and the minutes approval writes cannot diverge —
// they are the same computation over the same data, not two independent
// re-derivations that can drift apart.
async function loadItemSchedules(
  supabase: ReturnType<typeof createAdminClient>,
  employeeId: string,
  items: {
    attendance_log_id: string | null;
    proposed_schedule_id: string | null;
  }[],
): Promise<ResolvedItemSchedule[]> {
  const { data: emp, error: empErr } = await supabase
    .schema("hris")
    .from("employees")
    .select("schedules(id, time_in, time_out, break_start, break_end)")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) throw empErr;
  const employeeSchedule =
    (emp?.schedules as unknown as ScheduleLike | null) ?? null;

  // CREATE items have no row, so no row-level pin to look up — resolution for
  // them falls through to the employee's schedule (or the org default).
  const logIds = items
    .map((i) => i.attendance_log_id)
    .filter((v): v is string => !!v);
  const { data: logs, error: logsErr } =
    logIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .schema("hris")
          .from("attendance_logs")
          .select("id, schedule_id")
          .in("id", logIds);
  if (logsErr) throw logsErr;
  const rowScheduleIdByLogId = new Map(
    (logs ?? []).map((l) => [l.id as string, l.schedule_id as string | null]),
  );

  const scheduleIds = [
    ...new Set(
      items
        .map((i) => i.proposed_schedule_id)
        .concat([...rowScheduleIdByLogId.values()])
        .filter((v): v is string => !!v),
    ),
  ];
  const { data: schedules, error: schedErr } =
    scheduleIds.length === 0
      ? { data: [] as ScheduleLike[], error: null }
      : await supabase
          .schema("hris")
          .from("schedules")
          .select("id, time_in, time_out, break_start, break_end")
          .in("id", scheduleIds);
  if (schedErr) throw schedErr;
  const scheduleById = new Map(
    (schedules ?? []).map((s) => [s.id as string, s as ScheduleLike]),
  );

  return resolveItemSchedules(
    items,
    scheduleById,
    rowScheduleIdByLogId,
    employeeSchedule,
    DEFAULT_SCHEDULE,
  );
}

// Builds every day's finished attendance row and commits them through the
// transactional RPC. Extracted so the two ways a correction can reach a DTR —
// an HR reviewer approving a department's request, and a reviewer-level role
// filing one that applies on submit — run the SAME code. They must not become
// two re-derivations of "what does this correction write": that class of drift
// already produced one bug here, where the review summary and approval
// resolved schedules differently (see loadItemSchedules).
//
// Assumes the caller has checked authority and that the request is live.
async function applyCorrectionItems(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  employeeId: string,
  reviewer: { id: string; email: string },
): Promise<"applied" | "needs_rebase"> {
  const { data: items, error: itemErr } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", requestId)
    .order("duty_date");
  if (itemErr) throw itemErr;
  if (!items || items.length === 0) throw new Error("This request has no days");

  const resolved = await loadItemSchedules(supabase, employeeId, items);

  // A schedule deleted between submit and approval must not silently revert
  // the day to the inherited schedule — send the request back instead.
  // Unreachable through app code today: attendance_correction_items_proposed_schedule_id_fkey
  // is ON DELETE NO ACTION (migration 065), so Postgres itself refuses to
  // delete a schedule any live item still references — contrast
  // attendance_logs_schedule_id_fkey, which is ON DELETE SET NULL. This check
  // is defense-in-depth on top of that FK, not the primary guarantee: a
  // direct DB edit or a future migration that loosens the FK should still
  // fail safe here instead of silently applying numbers nobody reviewed.
  if (resolved.some((r) => r.itemPinMissing)) {
    await supabase
      .schema("hris")
      .from("attendance_correction_requests")
      .update({ status: "needs_rebase", updated_at: new Date().toISOString() })
      .eq("id", requestId);
    return "needs_rebase";
  }

  // duty_date is the key the RPC looks items up by (migration 067) —
  // attendance_log_id is nullable now and several items can share NULL, so it
  // no longer identifies a row. It is still sent for readability of the payload
  // in the audit log; the function reads the item's own value, not this one.
  const rows = items.map((item, i) => ({
    duty_date: item.duty_date,
    attendance_log_id: item.attendance_log_id,
    record: buildCorrectionRecord(employeeId, {
      duty_date: item.duty_date,
      disposition: item.disposition,
      schedule: resolved[i].schedule,
      scheduleId: item.proposed_schedule_id,
      time_in_am: hhmmOf(item.proposed_time_in_am),
      time_out_am: hhmmOf(item.proposed_time_out_am),
      time_in_pm: hhmmOf(item.proposed_time_in_pm),
      time_out_pm: hhmmOf(item.proposed_time_out_pm),
      reason_in_am: item.proposed_in_am_reason as CorrectionReason | null,
      reason_out_am: item.proposed_out_am_reason as CorrectionReason | null,
      reason_in_pm: item.proposed_in_pm_reason as CorrectionReason | null,
      reason_out_pm: item.proposed_out_pm_reason as CorrectionReason | null,
    }),
  }));

  const { data: outcome, error: rpcError } = await supabase
    .schema("hris")
    .rpc("apply_attendance_correction", {
      p_request_id: requestId,
      p_reviewer_id: reviewer.id,
      p_reviewer_email: reviewer.email,
      p_rows: rows,
    });
  if (rpcError) throw rpcError;
  return outcome as "applied" | "needs_rebase";
}

export async function approveCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canReviewAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();

  const { data: request, error: reqErr } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("id, employee_id, status")
    .eq("id", id)
    .single();
  if (reqErr) throw reqErr;
  if (!["pending", "needs_rebase"].includes(request.status)) {
    throw new Error("Only a live request can be approved");
  }

  const outcome = await applyCorrectionItems(
    supabase,
    id,
    request.employee_id,
    { id: user.id, email: user.email },
  );

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action:
      outcome === "applied"
        ? "attendance_correction_approved"
        : "attendance_correction_needs_rebase",
    tableName: "attendance_correction_requests",
    recordId: id,
    newValues: { outcome },
  });

  revalidatePath("/attendance-corrections");
  revalidatePath("/attendance");
  return { outcome };
}

export async function rejectCorrectionRequest(id: string, notes: string) {
  const user = await getCurrentUser();
  if (!user || !canReviewAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  if (!notes.trim()) throw new Error("Say why the request is being rejected");

  const supabase = createAdminClient();

  // Explicit pre-check, mirroring approveCorrectionRequest. Without it, an
  // update scoped to `.eq("id", id).in("status", [...])` against a request
  // that is already approved/rejected/cancelled matches zero rows —
  // PostgREST still returns error: null for that — and the code below would
  // log a rejection, and write a false audit entry, for a transition that
  // never happened.
  const { data: existing, error: fetchErr } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("status")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  if (!["pending", "needs_rebase"].includes(existing.status)) {
    throw new Error("Only a live request can be rejected");
  }

  const { error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_by_email: user.email,
      reviewed_at: new Date().toISOString(),
      review_notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "needs_rebase"]);
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_rejected",
    tableName: "attendance_correction_requests",
    recordId: id,
    newValues: { notes: notes.trim() },
  });
  revalidatePath("/attendance-corrections");
}

// The figure a reviewer actually needs: how many minutes of tardiness and
// undertime this request waives in total. Deriving it by scanning 22 rows is
// exactly what the review screen exists to avoid.
export async function getCorrectionReviewSummary(id: string) {
  const { request, items } = await getCorrectionRequest(id);
  const supabase = createAdminClient();

  // CREATE items have no existing row, so nothing to read "before" from — they
  // contribute 0 forgiven minutes, which is right: a day that was never
  // recorded was never charging anything.
  const logIds = items
    .map((i) => i.attendance_log_id)
    .filter((v): v is string => !!v);
  const { data: logs, error: logsErr } =
    logIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .schema("hris")
          .from("attendance_logs")
          .select("id, date, late_minutes, undertime_minutes")
          .in("id", logIds);
  if (logsErr) throw logsErr;
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));

  // Same resolver, same batched data as approveCorrectionRequest — see
  // loadItemSchedules. Previously this function passed a hard-coded `null`
  // row pin here, so any day carrying a row-level schedule override
  // (migration 047) showed HR a different forgiven-minutes figure than what
  // approval actually wrote.
  const resolved = await loadItemSchedules(supabase, request.employee_id, items);

  let totalLateForgiven = 0;
  let totalUndertimeForgiven = 0;
  const days: {
    duty_date: string;
    beforeLate: number;
    afterLate: number;
    beforeUndertime: number;
    afterUndertime: number;
  }[] = [];

  items.forEach((item, i) => {
    const after = buildCorrectionRecord(request.employee_id, {
      duty_date: item.duty_date,
      disposition: item.disposition,
      schedule: resolved[i].schedule,
      scheduleId: item.proposed_schedule_id,
      time_in_am: hhmmOf(item.proposed_time_in_am),
      time_out_am: hhmmOf(item.proposed_time_out_am),
      time_in_pm: hhmmOf(item.proposed_time_in_pm),
      time_out_pm: hhmmOf(item.proposed_time_out_pm),
      reason_in_am: item.proposed_in_am_reason as CorrectionReason | null,
      reason_out_am: item.proposed_out_am_reason as CorrectionReason | null,
      reason_in_pm: item.proposed_in_pm_reason as CorrectionReason | null,
      reason_out_pm: item.proposed_out_pm_reason as CorrectionReason | null,
    });
    const current = item.attendance_log_id
      ? byId.get(item.attendance_log_id)
      : undefined;
    const beforeLate = current?.late_minutes ?? 0;
    const beforeUndertime = current?.undertime_minutes ?? 0;
    const afterLate = after.late_minutes as number;
    const afterUndertime = after.undertime_minutes as number;

    totalLateForgiven += Math.max(0, beforeLate - afterLate);
    totalUndertimeForgiven += Math.max(0, beforeUndertime - afterUndertime);
    days.push({
      duty_date: item.duty_date,
      beforeLate,
      afterLate,
      beforeUndertime,
      afterUndertime,
    });
  });

  return { totalLateForgiven, totalUndertimeForgiven, days };
}
