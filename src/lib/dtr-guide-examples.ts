// Worked examples for the DTR guide (components/dtr/dtr-guide-dialog.tsx).
//
// Only the PUNCHES are written here. The four cells and the UT are computed by
// the same bucketPunchesForDuty / dayLateUndertime / unsettledSlots the
// importer and the DTR use, so the guide shows exactly what the DTR prints and
// cannot fall out of step when a rule changes.

import {
  applyUndertimeAbsenceRule,
  bucketPunchesForDuty,
  dayLateUndertime,
  unsettledSlots,
  type ScheduleLike,
  type SlotKey,
} from "./attendance-schedule.ts";

export type GuideSchedule = "regular" | "split" | "night";

export const GUIDE_SCHEDULES: Record<GuideSchedule, ScheduleLike & { label: string }> = {
  regular: {
    id: "regular",
    label: "8:00 AM – 12:00 PM / 1:00 – 5:00 PM",
    time_in: "08:00",
    time_out: "17:00",
    break_start: "12:00",
    break_end: "13:00",
  },
  split: {
    id: "split",
    label: "Split shift 4:00 – 8:00 AM / 1:00 – 5:00 PM",
    time_in: "04:00",
    time_out: "17:00",
    break_start: "08:00",
    break_end: "13:00",
  },
  night: {
    id: "night",
    label: "Night shift 10:00 PM – 6:00 AM, no break",
    time_in: "22:00",
    time_out: "06:00",
    break_start: null,
    break_end: null,
  },
};

interface GuideExample {
  id: string;
  title: string;
  schedule: GuideSchedule;
  /** HH:MM on the duty date; prefix "+" for the next calendar day. */
  punches: string[];
  note: string;
}

const EXAMPLES: GuideExample[] = [
  {
    id: "complete",
    title: "Complete day",
    schedule: "regular",
    punches: ["07:55", "12:01", "12:58", "17:03"],
    note: "All four cells filled, on time — nothing to charge.",
  },
  {
    id: "rescans",
    title: "Scanned several times on arrival",
    schedule: "regular",
    punches: ["07:30", "07:57", "08:01", "12:01"],
    note: "Repeat scans within an hour of arriving are one arrival; the earliest is kept. 8:01 is not a departure. The afternoon is fully blank, so it is a half day.",
  },
  {
    id: "forgot-noon",
    title: "Forgot the noon punch",
    schedule: "regular",
    punches: ["07:50", "07:59"],
    note: "7:59 is a repeat of the arrival, not AM Out. AM Out stays blank to settle; the blank afternoon is a half day.",
  },
  {
    id: "no-lunch",
    title: "In and out, no lunch punches",
    schedule: "regular",
    punches: ["08:00", "17:02"],
    note: "Each session is missing one cell. Nothing is charged until the employee settles the two lunch cells (real times, or NO BREAK).",
  },
  {
    id: "pm-rescan",
    title: "Scanned again after lunch, forgot to clock out",
    schedule: "regular",
    punches: ["07:58", "12:01", "12:58", "13:05"],
    note: "1:05 PM is a repeat of the lunch return, not the PM Out. PM Out stays blank to settle.",
  },
  {
    id: "lunch-rescan",
    title: "Scanned twice at lunch",
    schedule: "regular",
    punches: ["07:58", "12:01", "12:03", "12:58", "17:02"],
    note: "Lunch-out scans a few minutes apart are one departure; the latest is kept.",
  },
  {
    id: "lone-lunch",
    title: "Only one lunch punch",
    schedule: "regular",
    punches: ["08:00", "12:58", "17:02"],
    note: "A single lunch punch goes to the nearer scheduled time — 12:58 is nearer 1:00 PM, so it is the PM In.",
  },
  {
    id: "left-sick",
    title: "Left early in the morning",
    schedule: "regular",
    punches: ["08:00", "09:30"],
    note: "A punch more than an hour after arriving is a real departure. The blank afternoon is a half day unless settled (e.g. sick leave).",
  },
  {
    id: "absent-am",
    title: "Absent in the morning",
    schedule: "regular",
    punches: ["12:45", "17:02"],
    note: "The first punch is after lunch starts, so both punches are afternoon. The blank morning is a half day.",
  },
  {
    id: "late-day",
    title: "Late, late from lunch, left early",
    schedule: "regular",
    punches: ["08:15", "12:00", "13:10", "16:50"],
    note: "15 min late + 10 min late from lunch + 10 min early out.",
  },
  {
    id: "split",
    title: "Split shift",
    schedule: "split",
    punches: ["03:55", "04:03", "08:02", "12:55", "17:01"],
    note: "Same rules, measured against the 4–8 / 1–5 schedule. 4:03 is a repeat of the arrival.",
  },
  {
    id: "night",
    title: "Night shift across midnight",
    schedule: "night",
    punches: ["21:56", "+06:03"],
    note: "Both punches belong to the night the shift started. No-break schedules leave AM Out and PM In blank by design.",
  },
];

export interface GuideRow {
  id: string;
  title: string;
  schedule: GuideSchedule;
  scheduleLabel: string;
  /** The raw punches as 12-hour times. */
  punches: string[];
  /** AM In, AM Out, PM In, PM Out — as printed, null when blank. */
  cells: (string | null)[];
  /** Late + undertime as H:MM, the DTR's UT column. */
  ut: string;
  utMinutes: number;
  /** Whether the UT includes a flat half day for a fully blank session. */
  halfDay: boolean;
  unsettled: SlotKey[];
  /** True when the schedule has no noon break (AM Out / PM In unused). */
  noBreak: boolean;
  note: string;
}

// The guide's sample day. A Wednesday, so no rest-day rule applies.
const DUTY = "2026-10-21";
const NEXT = "2026-10-22";

export function to12h(t: string): string {
  const [hStr, m = "00"] = t.split(":");
  const h24 = Number(hStr);
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m.slice(0, 2)} ${period}`;
}

const hm = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;

export function buildGuideRows(): GuideRow[] {
  return EXAMPLES.map((ex) => {
    const sched = GUIDE_SCHEDULES[ex.schedule];
    const raw = ex.punches.map((p) =>
      p.startsWith("+")
        ? { date: NEXT, time: p.slice(1), status: "" }
        : { date: DUTY, time: p, status: "" },
    );
    const b = bucketPunchesForDuty(raw, DUTY, sched);
    const { lateMinutes, undertimeMinutes } = dayLateUndertime(DUTY, sched, b);
    const capped = applyUndertimeAbsenceRule(lateMinutes, undertimeMinutes, false);
    const utMinutes = capped.lateMins + capped.undertimeMins;
    const cell = (t: string | null, next: boolean) =>
      t ? `${to12h(t)}${next ? " (+1)" : ""}` : null;
    const noBreak = !sched.break_start;
    const amBlank = !b.time_in_am && !b.time_out_am;
    const pmBlank = !b.time_in_pm && !b.time_out_pm;
    return {
      id: ex.id,
      title: ex.title,
      schedule: ex.schedule,
      scheduleLabel: sched.label,
      punches: raw.map((p) => `${to12h(p.time)}${p.date === NEXT ? " (+1)" : ""}`),
      cells: [
        cell(b.time_in_am, b.time_in_am_next_day),
        cell(b.time_out_am, b.time_out_am_next_day),
        cell(b.time_in_pm, b.time_in_pm_next_day),
        cell(b.time_out_pm, b.time_out_pm_next_day),
      ],
      ut: hm(utMinutes),
      utMinutes,
      halfDay: !noBreak && (amBlank || pmBlank),
      unsettled: unsettledSlots(DUTY, sched, b),
      noBreak,
      note: ex.note,
    };
  });
}
