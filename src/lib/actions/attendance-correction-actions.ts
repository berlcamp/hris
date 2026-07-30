"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";
import {
  correctionRequestSchema,
  type CorrectionRequestInput,
} from "@/lib/validations/attendance-correction-schema";
import {
  buildCorrectionRecord,
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

/** Columns compared by the apply-time drift check. Keep in sync with migration 066. */
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

// Employees this user may correct: flagged eligible AND whose EFFECTIVE
// department (detailed_department_id ?? department_id) is the user's own.
// Exclusive, not additive — an employee detailed away belongs to the department
// that supervises the duty, which is also who signs their DTR.
export async function getCorrectableEmployees() {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role) || !user.departmentId) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, first_name, last_name, department_id, detailed_department_id")
    .eq("attendance_correction_eligible", true)
    .or(
      `detailed_department_id.eq.${user.departmentId},` +
        `and(detailed_department_id.is.null,department_id.eq.${user.departmentId})`,
    )
    .order("last_name");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    name: `${e.last_name}, ${e.first_name}`,
  }));
}

/** Throws unless `employeeId` is within the caller's correction reach. */
async function assertReach(employeeId: string) {
  const allowed = await getCorrectableEmployees();
  if (!allowed.some((e) => e.id === employeeId)) {
    throw new Error("Unauthorized");
  }
}

// The prefilled grid: one row per date in range that ALREADY has an attendance
// row. Dates with no record are returned with `hasRecord: false` and cannot be
// corrected — this workflow fixes misread and incomplete days, it never invents
// a day that was never recorded.
export async function getCorrectionDraftDays(
  employeeId: string,
  dateFrom: string,
  dateTo: string,
) {
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
  return data ?? [];
}

export async function createCorrectionRequest(
  input: CorrectionRequestInput,
  proof: FormData,
) {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const parsed = correctionRequestSchema.parse(input);
  await assertReach(parsed.employee_id);

  const file = proof.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A supporting document is required");
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error("The supporting document must be 10 MB or smaller");
  }
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    throw new Error("The supporting document must be a PDF, JPEG or PNG");
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
  // baseline taken at the same moment the requester saw the data.
  const logIds = parsed.items.map((i) => i.attendance_log_id);
  const { data: logs, error: logErr } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, time_in_am, time_out_am, time_in_pm, time_out_pm, schedule_id, source")
    .in("id", logIds);
  if (logErr) throw logErr;
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));
  if (byId.size !== logIds.length) {
    throw new Error("Some of those days no longer have an attendance record");
  }

  // Upload first: a failed upload must not leave a request row behind.
  const requestId = crypto.randomUUID();
  const path = `${parsed.employee_id}/${requestId}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`Could not upload the proof: ${uploadError.message}`);

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
      proof_path: path,
      proof_filename: file.name,
      proof_mime: file.type,
      proof_size: file.size,
      requested_by: user.id,
      requested_by_email: user.email,
    });
  if (reqError) {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
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
        before: snapshotOf(byId.get(i.attendance_log_id)!),
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
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    throw itemError;
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_requested",
    tableName: "attendance_correction_requests",
    recordId: requestId,
    newValues: {
      employee_id: parsed.employee_id,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      days: parsed.items.length,
    },
  });

  revalidatePath("/attendance-corrections");
  return { id: requestId };
}

export async function listCorrectionRequests() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select(
      "*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name)",
    )
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
  return data ?? [];
}

export async function getCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select(
      "*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name)",
    )
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

  // Private bucket — never a public URL.
  const { data: signed } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(request.proof_path, 60 * 10);

  return { request, items: items ?? [], proofUrl: signed?.signedUrl ?? null };
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
  items: { attendance_log_id: string; proposed_schedule_id: string | null }[],
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

  const { data: logs, error: logsErr } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, schedule_id")
    .in("id", items.map((i) => i.attendance_log_id));
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

  const { data: items, error: itemErr } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", id)
    .order("duty_date");
  if (itemErr) throw itemErr;
  if (!items || items.length === 0) throw new Error("This request has no days");

  const resolved = await loadItemSchedules(supabase, request.employee_id, items);

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
      .eq("id", id);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: "attendance_correction_needs_rebase",
      tableName: "attendance_correction_requests",
      recordId: id,
      newValues: { reason: "a pinned schedule was deleted before approval" },
    });
    revalidatePath("/attendance-corrections");
    return { outcome: "needs_rebase" as const };
  }

  const rows = items.map((item, i) => ({
    attendance_log_id: item.attendance_log_id,
    record: buildCorrectionRecord(request.employee_id, {
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
      p_request_id: id,
      p_reviewer_id: user.id,
      p_reviewer_email: user.email,
      p_rows: rows,
    });
  if (rpcError) throw rpcError;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action:
      outcome === "applied"
        ? "attendance_correction_approved"
        : "attendance_correction_needs_rebase",
    tableName: "attendance_correction_requests",
    recordId: id,
    newValues: { days: rows.length, outcome },
  });

  revalidatePath("/attendance-corrections");
  revalidatePath("/attendance");
  return { outcome: outcome as "applied" | "needs_rebase" };
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

  const { data: logs, error: logsErr } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, date, late_minutes, undertime_minutes")
    .in("id", items.map((i) => i.attendance_log_id));
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
    const current = byId.get(item.attendance_log_id);
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
