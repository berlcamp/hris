"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import { canDirectApplyAttendanceCorrection, canFileAttendanceCorrection, canReadOwnDeptCorrections, canRequestAttendanceCorrection, canReviewAttendanceCorrection, RoleInput } from "@/lib/auth-helpers";
import {
  correctionRequestSchema,
  type CorrectionRequestInput,
} from "@/lib/validations/attendance-correction-schema";
import {
  buildCorrectionRecord,
  datesInRange,
  dayOfWeekFor,
  isBlankCreateItem,
} from "@/lib/attendance-corrections";
import {
  correctionWindow,
  correctionWindowError,
  type CorrectionWindow,
} from "@/lib/correction-window";
import { manilaToday } from "@/lib/format-date";
import {
  applyCorrectionItems,
  hhmmOf,
  loadItemSchedules,
} from "@/lib/attendance-correction-apply";
import {
  MAX_PROOF_FILES,
  PROOF_BUCKET,
  proofObjectPath,
  proofRejection,
} from "@/lib/attendance-proof";
import type { CorrectionReason } from "@/lib/constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Why the save path RETURNS its refusals instead of throwing them.
//
// Next redacts every error a Server Action throws in a production build: the
// browser receives "An error occurred in the Server Components render. The
// specific message is omitted..." and nothing else. So a throw here — even one
// carrying a sentence written for the filer, like "this employee already has a
// correction request covering some of those dates" — reaches the user as an
// opaque platform error, and the only way to learn what actually happened is to
// read the server log for the digest. Returning the message keeps it intact.
export interface CorrectionActionError {
  error: string;
}

/** The message off an Error, a PostgrestError, or anything else thrown. */
function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Unexpected error";
}

// Server-side breadcrumb for the cases no message can explain by itself. The
// returned string tells the filer what happened; this puts the original error
// (constraint name, PostgREST code, stack) in the host's log next to it.
function logFailure(where: string, e: unknown): void {
  console.error(`[attendance-corrections] ${where}:`, e);
}

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
  /**
   * The employee's own schedule assignment, or null when they have none.
   *
   * Carried so the form can resolve what a day set to "Inherit" is actually
   * measured against — which decides whether the break slots are shown and how
   * the late/undertime preview is computed. Only the id: the page already loads
   * every schedule row (getSchedules), so the client looks the rest up there
   * rather than repeating time_in/time_out/break on ~1,000 employee rows.
   */
  schedule_id: string | null;
}

// Employees this user may correct.
//
// Direct-apply roles (HR / DTR / OCM) reach every ACTIVE employee, with no
// department scoping — this call replaces the manual-entry picker, which has
// always reached everyone.
//
// Department Admins reach every ACTIVE employee whose EFFECTIVE department
// (detailed_department_id ?? department_id) is their own. Effective, not
// additive — an employee detailed away belongs to the department that
// supervises the duty, which is also who signs their DTR.
//
// There is no per-employee eligibility flag any more. It was a second gate on
// top of this one, and in practice a department needs to fix whoever's punch
// the biometric misread; the constraint that matters is not WHO but WHEN, and
// that is enforced by correctionWindow (see assertCorrectionWindow) — a
// department can only reach into the payroll months still being closed.
export async function getCorrectableEmployees(): Promise<CorrectableEmployee[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const direct = canDirectApplyAttendanceCorrection(user.roles);
  if (!direct && (!canRequestAttendanceCorrection(user) || !user.departmentId)) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, biometric_no, schedule_id, department_id, detailed_department_id",
    )
    .eq("status", "active")
    .order("last_name");

  if (!direct) {
    query = query.or(
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
    schedule_id: (e.schedule_id as string | null) ?? null,
  }));
}

/** Whether `employeeId` is within the caller's correction reach. */
async function hasReach(employeeId: string): Promise<boolean> {
  const allowed = await getCorrectableEmployees();
  return allowed.some((e) => e.id === employeeId);
}

/** Throws unless `employeeId` is within the caller's correction reach. */
async function assertReach(employeeId: string) {
  if (!(await hasReach(employeeId))) {
    throw new Error("Unauthorized");
  }
}

// Throws unless every date is inside the payroll months a DEPARTMENT may still
// correct. A no-op for the direct-apply roles, whose date reach is unrestricted.
//
// `today` comes from the server clock in Asia/Manila, never from the request:
// a window derived from the filer's browser would move with their machine's
// timezone (and could be set by hand), and the whole point of the rule is that
// it is the same for everybody.
function assertCorrectionWindow(role: RoleInput, dates: string[]) {
  const failure = correctionWindowFailure(role, dates);
  if (failure) throw new Error(failure);
}

/** The same rule, as a message to return rather than an exception to throw. */
function correctionWindowFailure(
  role: RoleInput,
  dates: string[],
): string | null {
  if (canDirectApplyAttendanceCorrection(role)) return null;
  const window = correctionWindow(manilaToday());
  for (const date of dates) {
    const error = correctionWindowError(date, window);
    if (error) return error;
  }
  return null;
}

/** The open window for the CURRENT user, or null when they have no limit. */
export async function getCorrectionWindow(): Promise<CorrectionWindow | null> {
  const user = await getCurrentUser();
  if (!user || !canFileAttendanceCorrection(user)) {
    throw new Error("Unauthorized");
  }
  if (canDirectApplyAttendanceCorrection(user.roles)) return null;
  return correctionWindow(manilaToday());
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await assertReach(employeeId);
  // Refuse the range here as well as at submit, so a department admin never
  // fills in a grid of days it turns out they cannot file. createCorrectionRequest
  // re-checks every duty_date — this one is a courtesy, that one is the rule.
  assertCorrectionWindow(user.roles, [dateFrom, dateTo]);
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

/** What the browser gets back to upload a proof with — see createProofUploadTicket. */
export interface ProofUploadTicket {
  /** The id the request row will be created under, and the proof's folder. */
  requestId: string;
  /** One per requested filename, in order; each token is a one-shot upload
   *  credential for exactly its path. */
  uploads: { path: string; token: string }[];
}

/** The reference a filed request carries instead of the file itself. */
export interface CorrectionProofRef {
  requestId: string;
  /** `filename` is the name to show a reader. Cosmetic — the stored key is
   *  sanitized. */
  files: { path: string; filename: string }[];
}

/** One supporting document as stored in proof_files (migration 112). */
export interface CorrectionProofFile {
  path: string;
  filename: string;
  mime: string | null;
  size: number | null;
}

// Mints one-shot credentials the BROWSER uses to put the supporting documents
// straight into Storage, so the file never travels through a Server Action body.
//
// It cannot: Next caps an action's request body (serverActions.bodySizeLimit)
// and Vercel caps it again, lower, at the platform edge. A 9 MB scan sent as an
// action argument is rejected before the action runs, and the only thing the
// browser can say about that is "An unexpected response was received from the
// server" — no message this code writes ever reaches the user. Uploading
// directly sidesteps both limits and keeps the documented 10 MB allowance real.
//
// Authority is checked here, not at the edge: the token is issued only for a
// path under an employee this caller may file for, and only to a caller who may
// file at all.
export async function createProofUploadTicket(
  employeeId: string,
  filenames: string[],
): Promise<ProofUploadTicket | CorrectionActionError> {
  const user = await getCurrentUser();
  if (!user || !canFileAttendanceCorrection(user)) {
    return { error: "You are not allowed to file a correction." };
  }
  if (!(await hasReach(employeeId))) {
    return { error: "That employee is outside the records you may correct." };
  }

  if (filenames.length === 0 || filenames.length > MAX_PROOF_FILES) {
    return { error: `Attach between 1 and ${MAX_PROOF_FILES} files.` };
  }

  const requestId = crypto.randomUUID();
  const supabase = createAdminClient();
  const signed = await Promise.all(
    filenames.map(async (filename, index) => {
      const path = proofObjectPath(employeeId, requestId, filename, index);
      const { data, error } = await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUploadUrl(path);
      return { path, token: data?.token, error };
    }),
  );
  const uploads: ProofUploadTicket["uploads"] = [];
  for (const { path, token, error } of signed) {
    if (error || !token) {
      logFailure("createProofUploadTicket", error);
      return {
        error: `Could not start the upload: ${error?.message ?? "no upload URL was issued"}`,
      };
    }
    uploads.push({ path, token });
  }
  return { requestId, uploads };
}

export async function createCorrectionRequest(
  input: CorrectionRequestInput,
  proof: CorrectionProofRef | null,
): Promise<
  | { id: string; directApply: boolean; outcome: "applied" | "needs_rebase" | null }
  | CorrectionActionError
> {
  const user = await getCurrentUser();
  if (!user || !canFileAttendanceCorrection(user)) {
    return { error: "You are not allowed to file a correction." };
  }
  // Whether this filing applies on submit or waits for a reviewer is decided
  // HERE, from the caller's role — never from anything the client sends.
  const directApply = canDirectApplyAttendanceCorrection(user.roles);
  const parsedResult = correctionRequestSchema.safeParse(input);
  if (!parsedResult.success) {
    logFailure("createCorrectionRequest/validation", parsedResult.error);
    return {
      error:
        parsedResult.error.issues[0]?.message ??
        "Some of those days are not filled in correctly.",
    };
  }
  // A blank day with no record states nothing, and writing it would lock an
  // ABSENT row that the day's own punches can never replace (isBlankCreateItem).
  const parsed = {
    ...parsedResult.data,
    items: parsedResult.data.items.filter((i) => !isBlankCreateItem(i)),
  };
  if (parsed.items.length === 0) {
    return {
      error:
        "None of the included days has a time, a reason, or Clear as off — there is nothing to correct.",
    };
  }
  if (!(await hasReach(parsed.employee_id))) {
    return { error: "That employee is outside the records you may correct." };
  }
  // The authoritative window check. Every duty_date is tested, not just the
  // declared range: the schema already requires items to fall inside
  // date_from..date_to, but this action must not depend on that refinement
  // staying in place to keep a department out of a closed payroll month.
  const windowFailure = correctionWindowFailure(user.roles, [
    parsed.date_from,
    parsed.date_to,
    ...parsed.items.map((i) => i.duty_date),
  ]);
  if (windowFailure) return { error: windowFailure };

  // Proof is mandatory for a department filing and optional for direct-apply:
  // the document is what lets HR trust an assertion it cannot verify, and a
  // reviewer-level role filing directly is the party that would have judged it.
  // Migration 068's acr_proof_unless_direct enforces the same rule in the
  // schema, so this cannot be bypassed by calling the action directly.
  if (!proof?.files.length && !directApply) {
    return { error: "A supporting document is required" };
  }

  const supabase = createAdminClient();

  // The documents were uploaded by the browser (see createProofUploadTicket);
  // what arrives here is a claim about objects in the bucket. Verify the claim
  // rather than record it: each path must sit directly in the ticket's own folder
  // for THIS employee, the object must actually exist, and its size and type are
  // read back from Storage instead of taken from the client. The request id
  // comes from the ticket too, so a replayed one collides with the primary key
  // of the row it already created.
  const requestId = proof?.requestId ?? crypto.randomUUID();
  const claimed = proof?.files ?? [];
  // Every refusal from here on leaves the uploaded documents behind unless they are
  // cleaned up: the browser put them in the bucket before this action ran, and
  // nothing else will ever reference them.
  const discardProof = async () => {
    if (claimed.length > 0) {
      await supabase.storage
        .from(PROOF_BUCKET)
        .remove(claimed.map((f) => f.path));
    }
  };
  const proofFiles: CorrectionProofFile[] = [];
  if (proof && claimed.length > 0) {
    const folder = `${parsed.employee_id}/${proof.requestId}`;
    const names = claimed.map((f) => f.path.slice(folder.length + 1));
    if (
      !UUID_RE.test(proof.requestId) ||
      claimed.length > MAX_PROOF_FILES ||
      new Set(names).size !== names.length ||
      claimed.some((f) => !f.path.startsWith(`${folder}/`)) ||
      names.some((n) => !n || n.includes("/"))
    ) {
      return {
        error: "Those supporting documents do not belong to this request",
      };
    }
    // list() rather than info(): the latter is a newer Storage endpoint, and a
    // verification step that can 404 on an older project would recreate exactly
    // the failure this rewrite exists to remove.
    const { data: objects } = await supabase.storage
      .from(PROOF_BUCKET)
      .list(folder, { limit: 100 });
    for (const [i, file] of claimed.entries()) {
      const object = (objects ?? []).find((o) => o.name === names[i]);
      if (!object) {
        await discardProof();
        return {
          error: `${file.filename} did not finish uploading. Submit again.`,
        };
      }
      const size = (object.metadata?.size as number | undefined) ?? null;
      const mime = (object.metadata?.mimetype as string | undefined) ?? null;
      const rejection = proofRejection(size, mime);
      if (rejection) {
        await discardProof();
        return { error: `${file.filename}: ${rejection}` };
      }
      proofFiles.push({ path: file.path, filename: file.filename, mime, size });
    }
  }

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
  if (logErr) {
    logFailure("createCorrectionRequest/snapshot", logErr);
    await discardProof();
    return { error: `Could not read those days: ${logErr.message}` };
  }
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));
  if (byId.size !== logIds.length) {
    await discardProof();
    return {
      error: "Some of those days no longer have an attendance record",
    };
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
    if (clashErr) {
      logFailure("createCorrectionRequest/create-clash", clashErr);
      await discardProof();
      return { error: `Could not read those days: ${clashErr.message}` };
    }
    if ((clashes ?? []).length > 0) {
      await discardProof();
      return {
        error:
          "Attendance was recorded for one of those days while you were filling this in. Reload and try again.",
      };
    }
  }

  // A live request already claims some of these dates. The EXCLUDE constraint
  // acr_no_overlapping_pending refuses the insert below either way, but that
  // reads as a raw constraint violation; look it up first so the filer is told
  // WHICH request is in the way and who filed it. Direct-apply is not exempt:
  // the row is briefly 'pending' before it applies, so it takes the same lock —
  // and a department's pending request over the same days is exactly the thing
  // HR should decide on rather than quietly write past.
  const { data: blocking } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("date_from, date_to, status, requested_by_email")
    .eq("employee_id", parsed.employee_id)
    .in("status", ["pending", "needs_rebase"])
    .lte("date_from", parsed.date_to)
    .gte("date_to", parsed.date_from)
    .limit(1)
    .maybeSingle();
  if (blocking) {
    await discardProof();
    const filer = blocking.requested_by_email
      ? ` by ${blocking.requested_by_email}`
      : "";
    return {
      error:
        `This employee already has a correction request awaiting review for ` +
        `${blocking.date_from} to ${blocking.date_to}, filed${filer}. ` +
        `Approve, reject or withdraw it first — those dates are held until it is decided.`,
    };
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
      // The first document, which acr_proof_unless_direct reads; proof_files
      // holds all of them (migration 112).
      proof_path: proofFiles[0]?.path ?? null,
      proof_filename: proofFiles[0]?.filename ?? null,
      proof_mime: proofFiles[0]?.mime ?? null,
      proof_size: proofFiles[0]?.size ?? null,
      proof_files: proofFiles,
      requested_by: user.id,
      requested_by_email: user.email,
    });
  if (reqError) {
    logFailure("createCorrectionRequest/insert", reqError);
    await discardProof();
    // The EXCLUDE constraint is the likely cause; say so in plain language. The
    // lookup above catches this in almost every case — this is the race where a
    // request landed between that read and this insert.
    if (reqError.message.includes("acr_no_overlapping_pending")) {
      return {
        error:
          "This employee already has a correction request covering some of those dates",
      };
    }
    return { error: `Could not file the request: ${reqError.message}` };
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
    // were committed) and the uploaded proof before reporting.
    logFailure("createCorrectionRequest/items", itemError);
    await supabase
      .schema("hris")
      .from("attendance_correction_requests")
      .delete()
      .eq("id", requestId);
    await discardProof();
    return { error: `Could not file those days: ${itemError.message}` };
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
    try {
      outcome = await applyCorrectionItems(
        supabase,
        requestId,
        parsed.employee_id,
        { id: user.id, email: user.email },
        parsed.reason,
      );
    } catch (e) {
      logFailure("createCorrectionRequest/apply", e);
      return {
        error:
          `The request was filed but writing those days failed: ${messageOf(e)}. ` +
          `It is waiting in Attendance Corrections — open it and approve it to finish, or withdraw it.`,
      };
    }
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
      proof_count: proofFiles.length,
      has_proof: proofFiles.length > 0,
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

  if (canReviewAttendanceCorrection(user.roles)) {
    // Reviewers see everything.
  } else if (canDirectApplyAttendanceCorrection(user.roles)) {
    // OCM Admin: records attendance across every department, but reviews
    // nothing and has no department of its own to scope by. Its queue is what
    // IT filed. Deliberately not "everything" — it cannot act on another
    // department's request, and those carry proof documents and justifications
    // that are HR's to read. Without this branch the role fell through to the
    // throw below, which crashed the page it is shown in the sidebar.
    query = query.eq("requested_by", user.id);
  } else if (canReadOwnDeptCorrections(user) && user.departmentId) {
    // Filers and read-only viewers (Department Head) alike: own department only.
    query = query.eq("department_id", user.departmentId);
  } else if (canReadOwnDeptCorrections(user)) {
    // A department-scoped account with no department on its profile
    // (department_id is nullable for every role — see user-schema.ts). There is
    // no queue to show it, but the route gate already let it in, so an empty
    // list beats an opaque error page for what is an account-config gap.
    return [];
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

  const isReviewer = canReviewAttendanceCorrection(user.roles);
  const isOwnDept =
    canReadOwnDeptCorrections(user) &&
    !!user.departmentId &&
    request.department_id === user.departmentId;
  // Whoever filed it may read it back, whatever their department. This is what
  // lets OCM Admin — direct-apply across every department, reviewer of none —
  // open the request the wizard redirects to after "Record Attendance"; before
  // it, that landed on notFound(). Scoped to the filer's own id, so it widens
  // nobody's reach beyond what they themselves submitted.
  const isFiler = !!request.requested_by && request.requested_by === user.id;
  if (!isReviewer && !isOwnDept && !isFiler) throw new Error("Unauthorized");

  const { data: items } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", id)
    .order("duty_date");

  // Private bucket — never a public URL. A direct-apply filing may carry no
  // proof at all (migration 068), in which case there is nothing to sign.
  // An empty proof_files means a single document in the proof_* columns: filings
  // from before migration 112, and DTR Creator's.
  const stored = (request.proof_files ?? []) as CorrectionProofFile[];
  const files: CorrectionProofFile[] =
    stored.length > 0
      ? stored
      : request.proof_path
        ? [
            {
              path: request.proof_path,
              filename: request.proof_filename ?? "Document",
              mime: request.proof_mime ?? null,
              size: request.proof_size ?? null,
            },
          ]
        : [];
  const { data: signed } =
    files.length > 0
      ? await supabase.storage
          .from(PROOF_BUCKET)
          .createSignedUrls(
            files.map((f) => f.path),
            60 * 10,
          )
      : { data: null };

  return {
    request: request as unknown as CorrectionRequestListRow,
    items: (items ?? []) as unknown as CorrectionItemRow[],
    proofs: files.map((f, i) => ({
      filename: f.filename,
      mime: f.mime,
      url: signed?.[i]?.signedUrl || null,
    })),
  };
}

export async function cancelCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user)) {
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

export async function approveCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canReviewAttendanceCorrection(user.roles)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();

  const { data: request, error: reqErr } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("id, employee_id, status, reason")
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
    request.reason as string | null,
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
  if (!user || !canReviewAttendanceCorrection(user.roles)) {
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
      restDay: resolved[i].restDay,
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
