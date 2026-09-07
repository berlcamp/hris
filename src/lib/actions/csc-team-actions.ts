"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { hasRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { loadCscTeams, loadEventCandidates } from "@/lib/event-repo";
import {
  PERSON_REGISTRY_TABLE,
  normalizeCscTeamLabel,
  personKey,
} from "@/lib/csc-team";
import type { EventCandidate, EventSubjectKind } from "@/lib/types";

// ── CSC anniversary teams ─────────────────────────────────────────────────
//
// Super Admin only, end to end. The teams decide who marches with whom at the
// anniversary and nothing else — no payroll, no leave, no DTR reads them — so
// there is no reason for any other role to hold the pen, and every export here
// re-checks the role rather than trusting the page that called it.
//
// The roster is drawn from all three personnel registries at once
// (loadEventCandidates), because the teams are drawn from the whole active
// workforce: Plantilla, Temporary, Job Order and COS. That also means an
// assignment writes to one of three tables depending on who is being assigned
// — see PERSON_REGISTRY_TABLE.

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export interface CscTeamPersonRef {
  subject_kind: EventSubjectKind;
  subject_id: string;
}

/** One person on the roster, with the team they currently sit in. */
export interface CscTeamMember extends EventCandidate {
  csc_team: string | null;
}

export interface CscTeamRoster {
  members: CscTeamMember[];
  /** Every team label in use today, sorted, so the assign dialog can offer them. */
  teams: string[];
}

const ALL_KINDS: EventSubjectKind[] = ["employee", "temporary", "job_order", "cos"];

/** Postgres tolerates far more, but keep the `in` lists to the same page size the registries read at. */
const ID_CHUNK = 200;

/**
 * The whole active workforce with its team assignments.
 *
 * Everyone is returned, assigned or not: the point of this page is to find the
 * people who have no team yet, so filtering them out server-side would hide
 * the only rows that need work. It is ~1,000 rows across the three registries
 * and the table pages client-side.
 */
export async function getCscTeamRoster(): Promise<CscTeamRoster> {
  const user = await getCurrentUser();
  if (!hasRole(user?.roles, "super_admin")) return { members: [], teams: [] };

  const supabase = createAdminClient();
  const candidates = await loadEventCandidates(supabase, { kinds: ALL_KINDS });
  const teamByKey = await loadCscTeams(supabase, candidates);

  const members: CscTeamMember[] = candidates.map((c) => ({
    ...c,
    csc_team: teamByKey.get(personKey(c.subject_kind, c.subject_id)) ?? null,
  }));

  const teams = [...new Set(members.map((m) => m.csc_team).filter((t): t is string => !!t))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );

  return { members, teams };
}

/**
 * Puts people in a team, or takes them out of one when `team` is null.
 *
 * Bulk by design — HR assigns a department's worth of people at a time — and
 * grouped by TABLE rather than by kind so plantilla and temporary personnel
 * travel in the same update.
 */
export async function assignCscTeam(
  refs: CscTeamPersonRef[],
  team: string | null,
): Promise<ActionResult<{ updated: number }>> {
  const user = await getCurrentUser();
  if (!hasRole(user?.roles, "super_admin")) {
    return { success: false, error: "Not authorized" };
  }
  if (refs.length === 0) {
    return { success: false, error: "Select at least one person" };
  }

  const label = normalizeCscTeamLabel(team);
  const supabase = createAdminClient();

  const idsByTable = new Map<string, Set<string>>();
  for (const r of refs) {
    const table = PERSON_REGISTRY_TABLE[r.subject_kind];
    if (!table) continue;
    if (!idsByTable.has(table)) idsByTable.set(table, new Set());
    idsByTable.get(table)!.add(r.subject_id);
  }

  let updated = 0;
  for (const [table, idSet] of idsByTable) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const slice = ids.slice(i, i + ID_CHUNK);
      const { data, error } = await supabase
        .schema("hris")
        .from(table)
        .update({ csc_team: label })
        .in("id", slice)
        .select("id");
      if (error) return { success: false, error: error.message };
      updated += (data ?? []).length;
    }
  }

  // One audit row for the whole assignment, not one per person: a team change
  // is a single HR decision, and 900 rows of it would bury the trail rather
  // than record it.
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: label ? "assign_csc_team" : "clear_csc_team",
    tableName: "csc_team",
    newValues: { csc_team: label, people: refs.length, updated },
  });

  revalidatePath("/admin/csc-teams");
  revalidatePath("/events");
  return { success: true, data: { updated } };
}

/**
 * Renames a team everywhere it appears.
 *
 * The label is free text spread across three tables, so a typo caught after
 * 200 people were assigned has no other fix — without this the only way back
 * is to reassign each of them by hand. Merging into a name that already exists
 * is allowed and is exactly what fixing a typo looks like.
 */
export async function renameCscTeam(
  from: string,
  to: string,
): Promise<ActionResult<{ updated: number }>> {
  const user = await getCurrentUser();
  if (!hasRole(user?.roles, "super_admin")) {
    return { success: false, error: "Not authorized" };
  }

  const oldLabel = normalizeCscTeamLabel(from);
  const newLabel = normalizeCscTeamLabel(to);
  if (!oldLabel) return { success: false, error: "Pick the team to rename" };
  if (!newLabel) return { success: false, error: "New team name is required" };
  if (oldLabel === newLabel) return { success: true, data: { updated: 0 } };

  const supabase = createAdminClient();
  const tables = [...new Set(Object.values(PERSON_REGISTRY_TABLE))];

  let updated = 0;
  for (const table of tables) {
    const { data, error } = await supabase
      .schema("hris")
      .from(table)
      .update({ csc_team: newLabel })
      .eq("csc_team", oldLabel)
      .select("id");
    if (error) return { success: false, error: error.message };
    updated += (data ?? []).length;
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "rename_csc_team",
    tableName: "csc_team",
    oldValues: { csc_team: oldLabel },
    newValues: { csc_team: newLabel, updated },
  });

  revalidatePath("/admin/csc-teams");
  revalidatePath("/events");
  return { success: true, data: { updated } };
}
