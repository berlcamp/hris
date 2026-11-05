// Pure rules for the correction form's editable grid: what each slot may hold,
// and what the schedule dropdown lists. Kept out of the component so they can be
// unit-tested without a browser.

import { ABSENT_REASON } from "./attendance-schedule.ts";
import { to12h } from "./dtr-guide-examples.ts";

// base-ui Select cannot hold null, so a slot with no reason (the one that takes a
// time) holds this instead.
export const NO_REASON = "__none__";

export type SlotName = "in_am" | "out_am" | "in_pm" | "out_pm";

export interface SlotDraft {
  time_in_am: string;
  time_out_am: string;
  time_in_pm: string;
  time_out_pm: string;
  reason_in_am: string;
  reason_out_am: string;
  reason_in_pm: string;
  reason_out_pm: string;
}

const timeKey = (slot: SlotName) => `time_${slot}` as const;
const reasonKey = (slot: SlotName) => `reason_${slot}` as const;

// The slots one ABSENT covers. With a break window a day is two sessions. Without
// one it has a single arrival and departure, which the grid shows as AM In and
// PM Out.
function absentPairs(hasBreak: boolean): [SlotName, SlotName][] {
  return hasBreak
    ? [
        ["in_am", "out_am"],
        ["in_pm", "out_pm"],
      ]
    : [["in_am", "out_pm"]];
}

function partnerOf(slot: SlotName, hasBreak: boolean): SlotName | null {
  for (const [a, b] of absentPairs(hasBreak)) {
    if (a === slot) return b;
    if (b === slot) return a;
  }
  return null;
}

// Sets one slot's choice. A slot holds a time OR a reason, so any reason empties
// its time. ABSENT takes its pair with it, and leaving ABSENT releases the pair,
// so a session can never end up half absent.
export function setSlotReason<T extends SlotDraft>(
  draft: T,
  slot: SlotName,
  value: string,
  hasBreak: boolean,
): T {
  const next: T = { ...draft, [reasonKey(slot)]: value };
  if (value !== NO_REASON) next[timeKey(slot)] = "" as T[`time_${SlotName}`];

  const partner = partnerOf(slot, hasBreak);
  if (!partner) return next;
  if (value === ABSENT_REASON) {
    next[reasonKey(partner)] = ABSENT_REASON as T[`reason_${SlotName}`];
    next[timeKey(partner)] = "" as T[`time_${SlotName}`];
  } else if (draft[reasonKey(slot)] === ABSENT_REASON) {
    next[reasonKey(partner)] = NO_REASON as T[`reason_${SlotName}`];
  }
  return next;
}

// Re-establishes the ABSENT pairing after the schedule changes, because which
// slots pair up depends on it: moving a no-break absence onto a schedule with a
// break makes all four slots absent.
export function settleAbsentPairs<T extends SlotDraft>(
  draft: T,
  hasBreak: boolean,
): T {
  const next: T = { ...draft };
  for (const [a, b] of absentPairs(hasBreak)) {
    if (next[reasonKey(a)] !== ABSENT_REASON && next[reasonKey(b)] !== ABSENT_REASON) {
      continue;
    }
    for (const slot of [a, b]) {
      next[reasonKey(slot)] = ABSENT_REASON as T[`reason_${SlotName}`];
      next[timeKey(slot)] = "" as T[`time_${SlotName}`];
    }
  }
  return next;
}

export function scheduleHoursLabel(s: { time_in: string; time_out: string }): string {
  return `${to12h(s.time_in)} – ${to12h(s.time_out)}`;
}

export interface ScheduleOption {
  value: string;
  label: string;
}

interface ScheduleHours {
  id: string;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
}

// The schedule dropdown shows hours only, which makes schedules that differ only
// by name look identical.
//   * `all` has every schedule, so a day already pinned to any of them still
//     shows its hours.
//   * `choices` is what the list offers: one per distinct set of hours and break,
//     since picking any of those scores a day exactly the same.
// Same hours with a different break are NOT the same schedule: a no-break one
// hides the grid's two middle slots. Only that case carries a "no break" tag,
// because the hours alone cannot tell them apart.
export function scheduleOptions(schedules: readonly ScheduleHours[]): {
  all: ScheduleOption[];
  choices: ScheduleOption[];
} {
  const hoursKey = (s: ScheduleHours) => `${s.time_in}|${s.time_out}`;
  const hasBreakVariant = new Set(
    schedules.filter((s) => s.break_start && s.break_end).map(hoursKey),
  );
  const seen = new Set<string>();
  const all: ScheduleOption[] = [];
  const choices: ScheduleOption[] = [];
  for (const s of schedules) {
    const noBreak = !(s.break_start && s.break_end);
    const option = {
      value: s.id,
      label:
        scheduleHoursLabel(s) +
        (noBreak && hasBreakVariant.has(hoursKey(s)) ? " · no break" : ""),
    };
    all.push(option);
    const key = `${hoursKey(s)}|${s.break_start}|${s.break_end}`;
    if (!seen.has(key)) {
      seen.add(key);
      choices.push(option);
    }
  }
  return { all, choices };
}
