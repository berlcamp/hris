import type { EventSubjectKind } from "@/lib/types";

/**
 * CSC anniversary teams — the free-text group label ("Group 1 - White Rhinos")
 * that migrations 083/085 put on all three personnel registries.
 *
 * The label is deliberately NOT a lookup table: the teams are renamed every
 * anniversary, they carry no rules, and nothing computes anything from them
 * (see the header of migration 083). The consequence is that this module is
 * where the two things a free-text key still needs live — which table holds
 * which kind of person, and one canonical spelling of a label so "Group 1 -
 * White Rhinos" and "group 1 -  white rhinos " do not become two teams.
 */

/**
 * The registry table each kind of person lives in.
 *
 * 'employee' and 'temporary' are both hris.employees rows — they differ only by
 * employment_type — so they share one table and one read.
 */
export const PERSON_REGISTRY_TABLE: Record<EventSubjectKind, string> = {
  employee: "employees",
  temporary: "employees",
  job_order: "job_order_employees",
  cos: "cos_employees",
};

/** The key every cross-registry map in this codebase uses; the three registries share no id space. */
export function personKey(kind: EventSubjectKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * One canonical spelling of a team label, or null for "no team".
 *
 * Collapses runs of whitespace and trims, so a label retyped in the assign
 * dialog lands on the team that already exists rather than beside it. Case is
 * left alone on purpose: these labels are printed on tarpaulins and HR spells
 * them the way it wants them read.
 */
export function normalizeCscTeamLabel(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}
