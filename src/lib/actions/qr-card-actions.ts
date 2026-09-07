"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageEvents } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { EMPLOYMENT_LABELS, loadEventCandidates } from "@/lib/event-repo";
import { formatEmployeeDisplayName } from "@/lib/employee-name-match";
import { generateQrCardDataUrl } from "@/lib/qr-card-image";
import { idText } from "@/lib/id-text";
import { eventSubjectKindSchema } from "@/lib/validations/event-schema";
import type { EventSubjectKind, QrCardSubject } from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Same shape the migration mints: 'H' + 20 uppercase hex.
 *
 * The 'H' prefix is not decoration — it lets the scanner reject a foreign QR,
 * including this app's own public-profile code
 * (http://aoadmin.sortbrite.com/employee/<id_number>, src/lib/employee-qr.ts),
 * before it ever reaches the network.
 */
function mintToken(): string {
  return "H" + randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
}

/** True for a string that could be one of our tokens. Mirrored on the device. */
export async function isQrCardToken(value: string): Promise<boolean> {
  return /^H[0-9A-F]{20}$/.test(value.trim().toUpperCase());
}

/**
 * The people to print cards for, each with a live QR token, minting one for
 * anybody who has none yet.
 *
 * Minting here rather than at print time for everyone keeps the migration's
 * backfill from being a hard prerequisite for new hires: anyone added to a
 * registry after 081 ran gets a credential the first time HR prints for them.
 */
export async function getQrCardSubjects(input: {
  kinds: EventSubjectKind[];
  departmentIds?: string[];
  areaIds?: string[];
}): Promise<QrCardSubject[]> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) return [];

  const kinds = input.kinds.filter((k) => eventSubjectKindSchema.safeParse(k).success);
  if (kinds.length === 0) return [];

  const supabase = createAdminClient();
  const candidates = await loadEventCandidates(supabase, {
    kinds,
    departmentIds: input.departmentIds,
    areaIds: input.areaIds,
  });
  if (candidates.length === 0) return [];

  const tokens = new Map<string, string>();
  const ids = candidates.map((c) => c.subject_id);
  const ID_CHUNK = 200;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .schema("hris")
      .from("qr_credentials")
      .select("token, subject_kind, subject_id")
      .is("revoked_at", null)
      .in("subject_id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as {
      token: string;
      subject_kind: EventSubjectKind;
      subject_id: string;
    }[]) {
      tokens.set(`${c.subject_kind}:${c.subject_id}`, c.token);
    }
  }

  const missing = candidates.filter((c) => !tokens.has(`${c.subject_kind}:${c.subject_id}`));
  if (missing.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = missing.slice(i, i + CHUNK).map((c) => ({
        token: mintToken(),
        subject_kind: c.subject_kind,
        subject_id: c.subject_id,
        created_by: user!.id,
        updated_by: user!.id,
      }));
      const { error } = await supabase
        .schema("hris")
        .from("qr_credentials")
        .insert(batch);
      if (error) throw new Error(error.message);
      for (const b of batch) tokens.set(`${b.subject_kind}:${b.subject_id}`, b.token);
    }
  }

  return candidates
    .map((c) => {
      const token = tokens.get(`${c.subject_kind}:${c.subject_id}`);
      if (!token) return null;
      return {
        subject_kind: c.subject_kind,
        subject_id: c.subject_id,
        full_name: c.full_name,
        id_number: c.id_number,
        group_name: c.group_name,
        employment_label: c.employment_label,
        token,
      } satisfies QrCardSubject;
    })
    .filter((c): c is QrCardSubject => c !== null);
}

/**
 * Reissues a card: revokes the live credential and mints a new one.
 *
 * ROTATION, not addition. There is no photo on the card — nothing printed on it
 * proves the holder is the person — so a lost card that keeps working is a
 * standing forgery. Revoking kills the old code the moment the new one is
 * issued. Attendance already recorded against the old token is untouched;
 * event_attendance.qr_token keeps the raw code for the audit trail.
 */
export async function rotateQrCredential(
  subjectKind: EventSubjectKind,
  subjectId: string,
  reason: string,
): Promise<ActionResult<{ token: string }>> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }
  if (!eventSubjectKindSchema.safeParse(subjectKind).success) {
    return { success: false, error: "Unknown personnel type" };
  }

  const supabase = createAdminClient();
  const { error: revokeError } = await supabase
    .schema("hris")
    .from("qr_credentials")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason.trim() || null,
      updated_by: user!.id,
    })
    .eq("subject_kind", subjectKind)
    .eq("subject_id", subjectId)
    .is("revoked_at", null);
  if (revokeError) return { success: false, error: revokeError.message };

  const token = mintToken();
  const { error } = await supabase
    .schema("hris")
    .from("qr_credentials")
    .insert({
      token,
      subject_kind: subjectKind,
      subject_id: subjectId,
      created_by: user!.id,
      updated_by: user!.id,
    });
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "rotate_qr_credential",
    tableName: "qr_credentials",
    recordId: subjectId,
    newValues: { subject_kind: subjectKind, reason },
  });

  revalidatePath("/events/cards");
  return { success: true, data: { token } };
}

/**
 * Stamps a print run onto the credentials it covered.
 *
 * "Was Juan ever given a card?" is asked constantly once a print run goes out,
 * and nothing else in the system can answer it.
 */
export async function markQrCardsPrinted(
  tokens: string[],
): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }
  if (tokens.length === 0) return { success: true, data: { count: 0 } };

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const CHUNK = 200;
  let updated = 0;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);
    const { data: existing, error: readError } = await supabase
      .schema("hris")
      .from("qr_credentials")
      .select("id, print_count")
      .in("token", slice);
    if (readError) return { success: false, error: readError.message };

    for (const row of (existing ?? []) as { id: string; print_count: number }[]) {
      const { error } = await supabase
        .schema("hris")
        .from("qr_credentials")
        .update({ printed_at: now, print_count: row.print_count + 1 })
        .eq("id", row.id);
      if (error) return { success: false, error: error.message };
      updated += 1;
    }
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "print_qr_cards",
    tableName: "qr_credentials",
    newValues: { count: updated },
  });

  return { success: true, data: { count: updated } };
}

// ── One employee's card, on their own profile ─────────────────────────────
//
// Same credential the bulk print screen issues — one token per person, minted
// once and rotated on reissue — shown on /employees/[id] so HR can hand out or
// reprint a single card without going back to the bulk screen to hunt for one
// name. Gated on canManageEvents like every other path that can see a token:
// the card carries no photo, so the token IS the identity.

/** A card ready to render or print: the credential plus its QR image. */
export interface EmployeeQrCard extends QrCardSubject {
  /** PNG data URL of the token, rendered server-side. */
  qrDataUrl: string;
}

export interface EmployeeQrCardState {
  /** The live card, or null when nobody has issued one for this record yet. */
  card: EmployeeQrCard | null;
  /** May a card be issued now? False once `reason` explains why not. */
  canIssue: boolean;
  /** Why this record has no card and cannot be given one. Null when it can. */
  reason: string | null;
}

/**
 * Which events subject an hris.employees row is.
 *
 * Only plantilla and temporary rows are: Job Order and COS personnel have
 * registries of their own, and the rows sitting in hris.employees with those
 * employment types are the legacy orphans loadEventCandidates deliberately
 * skips. Issuing a card against one would mint a credential that no scan could
 * ever resolve back to a person.
 */
function employeeSubjectKind(employmentType: string): EventSubjectKind | null {
  if (employmentType === "plantilla") return "employee";
  if (employmentType === "temporary") return "temporary";
  return null;
}

async function readEmployeeCardRow(supabase: ReturnType<typeof createAdminClient>, employeeId: string) {
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, middle_name, last_name, suffix, id_number, employee_no, employment_type, status, departments!employees_department_id_fkey(name)",
    )
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    id_number: string | number | null;
    employee_no: string | number | null;
    employment_type: string;
    status: string;
    departments: { name: string } | null;
  } | null;
}

/**
 * The employee's attendance card as it stands — no minting.
 *
 * Deliberately read-only: this runs while the profile page renders, and a page
 * view is the wrong place to mint a bearer credential. Issuing is the explicit
 * button next to the empty slot (issueQrCardForEmployee).
 */
export async function getEmployeeQrCard(
  employeeId: string,
): Promise<EmployeeQrCardState> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { card: null, canIssue: false, reason: null };
  }

  const supabase = createAdminClient();
  const row = await readEmployeeCardRow(supabase, employeeId);
  if (!row) return { card: null, canIssue: false, reason: null };

  const kind = employeeSubjectKind(row.employment_type);
  if (!kind) {
    return {
      card: null,
      canIssue: false,
      reason:
        "Job Order and COS personnel carry their card in their own registry — print it from QR ID Cards.",
    };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("qr_credentials")
    .select("token")
    .eq("subject_kind", kind)
    .eq("subject_id", employeeId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const token = (data as { token: string } | null)?.token ?? null;
  if (!token) {
    // An inactive record keeps a card it already has — attendance filed against
    // it stays resolvable — but is not given a new one.
    const active = row.status === "active";
    return {
      card: null,
      canIssue: active,
      reason: active
        ? null
        : "Cards are issued to active personnel only.",
    };
  }

  return {
    card: {
      subject_kind: kind,
      subject_id: row.id,
      full_name: formatEmployeeDisplayName(row),
      // Same fallback the bulk print screen uses, so one person's card reads
      // identically wherever it was produced.
      id_number: idText(row.id_number) ?? idText(row.employee_no),
      group_name: row.departments?.name ?? null,
      employment_label: EMPLOYMENT_LABELS[kind],
      token,
      qrDataUrl: await generateQrCardDataUrl(token),
    },
    canIssue: false,
    reason: null,
  };
}

/** Mints this employee's first card. A no-op returning the live one if it already exists. */
export async function issueQrCardForEmployee(
  employeeId: string,
): Promise<ActionResult<{ token: string }>> {
  const user = await getCurrentUser();
  if (!canManageEvents(user?.roles)) {
    return { success: false, error: "Not authorized" };
  }

  const supabase = createAdminClient();
  const row = await readEmployeeCardRow(supabase, employeeId);
  if (!row) return { success: false, error: "Employee not found" };

  const kind = employeeSubjectKind(row.employment_type);
  if (!kind) {
    return { success: false, error: "This record cannot carry an attendance card" };
  }
  if (row.status !== "active") {
    return { success: false, error: "Cards are issued to active personnel only" };
  }

  const { data: existing, error: readError } = await supabase
    .schema("hris")
    .from("qr_credentials")
    .select("token")
    .eq("subject_kind", kind)
    .eq("subject_id", employeeId)
    .is("revoked_at", null)
    .maybeSingle();
  if (readError) return { success: false, error: readError.message };
  if (existing) return { success: true, data: { token: (existing as { token: string }).token } };

  const token = mintToken();
  const { error } = await supabase
    .schema("hris")
    .from("qr_credentials")
    .insert({
      token,
      subject_kind: kind,
      subject_id: employeeId,
      created_by: user!.id,
      updated_by: user!.id,
    });
  if (error) return { success: false, error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "issue_qr_credential",
    tableName: "qr_credentials",
    recordId: employeeId,
    newValues: { subject_kind: kind },
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/events/cards");
  return { success: true, data: { token } };
}
