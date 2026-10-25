// Helpers for translating biometric punches into AM/PM slots on an
// attendance_logs row, given a per-employee work schedule. Used by the Dahua
// importer, manual entry, and the DTR builder so all three agree on what
// counts as late / undertime / which date a punch belongs to.

export interface ScheduleLike {
  id: string;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
}

// Fallback used when an employee has no schedule assigned. Matches the
// historical 8AM–5PM with 12–1 lunch break the project assumed before
// migration 030.
export const DEFAULT_SCHEDULE: ScheduleLike = {
  id: "__default__",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

export function trimTimeStr(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

// Day of week (0 = Sunday) for a YYYY-MM-DD string, computed through Date.UTC
// rather than `new Date(iso + "T00:00:00")`. The latter parses as LOCAL time,
// so the same date can land on a different weekday depending on where the
// caller runs — and this value is shared by server actions and the browser.
export function dayOfWeekFor(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Saturday and Sunday are REST DAYS: no hours are owed on them.
//
// hris.schedules carries hours only (time_in/time_out/break) — migrations 030
// and 036 never gave it a day-of-week column — so nothing in this system can
// declare that an employee is rostered on a Saturday. The weekend is therefore
// the one span the schedule model can say nobody is scheduled for, and the DTR
// has always treated it that way for a date with no attendance row at all.
export function isRestDay(iso: string): boolean {
  const dow = dayOfWeekFor(iso);
  return dow === 0 || dow === 6;
}

// Postgres `TIME` columns serialize as "HH:MM:SS"; the rest of the codebase
// uses "HH:MM". Always normalize before formatting into Date strings or you
// get "HH:MM:SS:00" → NaN.
function hhmm(t: string): string {
  return t.slice(0, 5);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function crossesMidnight(sched: ScheduleLike): boolean {
  return timeToMinutes(sched.time_out) <= timeToMinutes(sched.time_in);
}

export function hasBreak(sched: ScheduleLike): boolean {
  return !!(sched.break_start && sched.break_end);
}

function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Resolves the "duty date" a raw punch belongs to. For day shifts this is the
// punch date. For night shifts (time_out <= time_in) punches taken before the
// shift's mid-rest cutoff belong to the previous calendar day's duty date.
export function dutyDateFor(
  punchDate: string,
  punchTime: string,
  sched: ScheduleLike,
): string {
  if (!crossesMidnight(sched)) return punchDate;
  const ti = timeToMinutes(sched.time_in);
  const to = timeToMinutes(sched.time_out);
  // Midpoint of the off-shift window (the gap between time_out and time_in
  // on the same calendar day) — punches before this are end-of-previous-shift.
  const splitMin = Math.floor((ti + to) / 2);
  if (timeToMinutes(punchTime) < splitMin) {
    return addDaysIso(punchDate, -1);
  }
  return punchDate;
}

// For a midnight-crossing schedule, decides whether a wall-clock HH:MM belongs
// to the calendar day AFTER the duty date — i.e. the early-morning portion of
// the shift (a 02:00 or 06:30 punch) rather than the duty-date evening. Uses the
// off-shift midpoint (mirroring dutyDateFor) so an EARLY arrival just before
// time_in (e.g. 21:50 for a 22:00 shift) correctly stays on the duty date
// instead of being mistaken for the next morning. Day shifts always return
// false. Accepts "HH:MM" or "HH:MM:SS".
export function timeOnNextDayForNightShift(
  time: string,
  sched: ScheduleLike,
): boolean {
  if (!crossesMidnight(sched)) return false;
  const ti = timeToMinutes(sched.time_in);
  const to = timeToMinutes(sched.time_out);
  const splitMin = Math.floor((ti + to) / 2);
  return timeToMinutes(time) < splitMin;
}

// Returns the wall-clock datetime for a HH:MM time relative to duty date `D`.
// If `time` falls before `time_in` (numerically), it belongs to D+1 (i.e. the
// schedule wraps past midnight).
function shiftMomentMs(dutyDate: string, sched: ScheduleLike, time: string): number {
  const t = timeToMinutes(time);
  const ti = timeToMinutes(sched.time_in);
  const onNextDay = t < ti && crossesMidnight(sched);
  const dateStr = onNextDay ? addDaysIso(dutyDate, 1) : dutyDate;
  return new Date(`${dateStr}T${hhmm(time)}:00`).getTime();
}

export interface BucketResult {
  time_in_am: string | null; // HH:MM
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  // Whether each slot's wall-clock time is on the day after `dutyDate`. The
  // importer / manual entry uses this to write the correct `${date}T${time}`
  // TIMESTAMPTZ value.
  time_in_am_next_day: boolean;
  time_out_am_next_day: boolean;
  time_in_pm_next_day: boolean;
  time_out_pm_next_day: boolean;
}

const emptyBucket = (): BucketResult => ({
  time_in_am: null,
  time_out_am: null,
  time_in_pm: null,
  time_out_pm: null,
  time_in_am_next_day: false,
  time_out_am_next_day: false,
  time_in_pm_next_day: false,
  time_out_pm_next_day: false,
});

interface Punch {
  // HH:MM
  time: string;
  // Whether the punch's calendar date is duty-date + 1 (relevant for night shifts).
  onNextDay: boolean;
  // Absolute ms timestamp — used for sorting and slot assignment.
  ms: number;
}

const MINUTE_MS = 60_000;

// A punch this soon after an arrival, and before the middle of the session, is
// a re-scan of the arrival — not a departure. 7:30 / 7:57 / 8:01 is one arrival
// at 7:30. Agreed with the HR office; a genuine early departure (leaving sick
// at 9:30) is more than an hour after arriving and still counts.
export const ARRIVAL_RESCAN_MINUTES = 60;

// Re-scans of the lunch departure (12:01, 12:03) are one departure, kept at the
// latest. Anything further apart is the return from lunch: nobody takes a
// lunch shorter than this.
export const DEPARTURE_RESCAN_MINUTES = 10;

// Sorts one duty date's raw punches into the four DTR cells.
//
// Time decides, never the device's Check In / Break Out label: an employee who
// logs in at Building 1 and out at Building 3 is "Check In" on both, because
// each device labels by its own order. The rules, for a schedule with a break:
//
//   AM in   the first punch, if it is before break start (otherwise the
//           employee was absent in the morning and every punch is afternoon).
//           Punches before the morning's midpoint and within
//           ARRIVAL_RESCAN_MINUTES of it are re-scans and are dropped.
//   AM out  the next punch, if it is nearer break start than break end (before
//           the lunch midpoint) — the lunch departure, or an early departure
//           for the day. Its re-scans within DEPARTURE_RESCAN_MINUTES extend it,
//           so it keeps the latest.
//   PM in   the first remaining punch, unless it is already past the
//           afternoon's midpoint — then there was no return from lunch and it
//           is a departure.
//   PM out  the last remaining punch, if it is past the afternoon's midpoint
//           or more than ARRIVAL_RESCAN_MINUTES after the PM in.
//
// A cell the rules cannot fill stays blank. Blank is UNSETTLED, not guessed:
// see unsettledSlots. A schedule with no break has one session — first punch
// in, last punch out, by the same re-scan rule — and its AM-out / PM-in cells
// stay blank by design.
export function bucketPunchesForDuty(
  punchesByActualDate: { date: string; time: string; status?: string | null }[],
  dutyDate: string,
  sched: ScheduleLike,
): BucketResult {
  if (punchesByActualDate.length === 0) return emptyBucket();

  const punches: Punch[] = punchesByActualDate.map((p) => {
    const time = hhmm(p.time);
    return {
      time,
      onNextDay: p.date !== dutyDate,
      ms: new Date(`${p.date}T${time}:00`).getTime(),
    };
  });
  punches.sort((a, b) => a.ms - b.ms);

  const out = emptyBucket();
  const set = (slot: "in_am" | "out_am" | "in_pm" | "out_pm", p: Punch | null) => {
    if (!p) return;
    out[`time_${slot}`] = p.time;
    out[`time_${slot}_next_day`] = p.onNextDay;
  };
  const rescanMs = ARRIVAL_RESCAN_MINUTES * MINUTE_MS;
  const inMs = shiftMomentMs(dutyDate, sched, sched.time_in);
  const outMs = shiftMomentMs(dutyDate, sched, sched.time_out);

  // A departure follows an arrival by more than a re-scan, or is past the
  // middle of the session it closes. Monotonic in time, so if any punch
  // qualifies the last one does.
  const departureAfter = (rest: Punch[], arrival: Punch, midMs: number) => {
    const last = rest[rest.length - 1];
    if (!last || last === arrival) return null;
    return last.ms >= midMs || last.ms - arrival.ms > rescanMs ? last : null;
  };

  if (!hasBreak(sched)) {
    const midMs = (inMs + outMs) / 2;
    const first = punches[0];
    if (first.ms >= midMs) {
      // Only end-of-shift punches: the clock-out, with no clock-in.
      set("out_pm", punches[punches.length - 1]);
    } else {
      set("in_am", first);
      set("out_pm", departureAfter(punches, first, midMs));
    }
    return out;
  }

  const breakStartMs = shiftMomentMs(dutyDate, sched, sched.break_start!);
  const breakEndMs = shiftMomentMs(dutyDate, sched, sched.break_end!);
  const amMidMs = (inMs + breakStartMs) / 2;
  const lunchMidMs = (breakStartMs + breakEndMs) / 2;
  const pmMidMs = (breakEndMs + outMs) / 2;

  let i = 0;
  if (punches[0].ms < breakStartMs) {
    const amIn = punches[0];
    set("in_am", amIn);
    i = 1;
    while (
      i < punches.length &&
      punches[i].ms < amMidMs &&
      punches[i].ms - amIn.ms <= rescanMs
    ) {
      i++;
    }
    if (i < punches.length && punches[i].ms < lunchMidMs) {
      let amOut = punches[i++];
      while (
        i < punches.length &&
        punches[i].ms < breakEndMs &&
        punches[i].ms - amOut.ms <= DEPARTURE_RESCAN_MINUTES * MINUTE_MS
      ) {
        amOut = punches[i++];
      }
      set("out_am", amOut);
    }
  }

  const rest = punches.slice(i);
  if (rest.length > 0) {
    if (rest[0].ms >= pmMidMs) {
      set("out_pm", rest[rest.length - 1]);
    } else {
      set("in_pm", rest[0]);
      set("out_pm", departureAfter(rest, rest[0], pmMidMs));
    }
  }
  return out;
}

// A half day. An LGU workday is two sessions — morning and afternoon. A session
// with BOTH cells blank (dayLateUndertime), or with no attendance at all on a
// day that has no row (a half-day holiday's other half, unrecordedDayCharge),
// is charged as a whole half day, flat, whatever the schedule's actual shape.
// A session with only ONE blank cell is never charged this: that cell is
// unsettled (see unsettledSlots).
export const HALF_DAY_UNDERTIME_MINUTES = 4 * 60; // 240

export interface DaySlotTimes {
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  time_in_am_next_day?: boolean;
  time_in_pm_next_day?: boolean;
  time_out_pm_next_day?: boolean;
}

/** Which slots carry a reason (OB / FW / TRAVEL / NO BREAK / leave / off). */
export interface SlotReasonFlags {
  in_am?: boolean;
  out_am?: boolean;
  in_pm?: boolean;
  out_pm?: boolean;
}

export interface DayMinutes {
  lateMinutes: number;
  undertimeMinutes: number;
}

// The whole of a day's late + undertime, in ONE place.
//
// For a schedule with a break, a day is two sessions — morning (AM in/out) and
// afternoon (PM in/out):
//   * a session with BOTH cells blank rendered no service and is charged a
//     flat half day (HALF_DAY_UNDERTIME_MINUTES), unless excused or explained;
//   * a session with ONE blank cell costs nothing — the cell is unsettled (see
//     unsettledSlots) and the employee settles it through a correction.
// Migration 070 charged the flat half day for ONE blank cell too, which billed
// eight hours to an employee who came in at 8:00 and left at 17:00 but skipped
// the lunch scans, and printed the day ABSENT. A day with no punches at all is
// an absence and is charged by the DTR, not here.
//
// The punches that ARE there are still measured: lateness against time_in, a
// late return from lunch against break_end, an early departure against
// time_out. A slot reason (OB / FW / TRAVEL / NO BREAK / …) excuses the punch it
// sits on; excuseAm / excusePm (a holiday half, or a day-level reason like OFF)
// excuse that session's charges wholesale.
//
// On a REST DAY NOTHING is charged at all: no hours are owed, so there is no
// schedule for a punch to be measured against. The times still print on the
// DTR; only the deduction is dropped. Which days are rest days is the
// employee's schedule's call (opts.restDay, from resolveDaySchedule); without
// it, Saturday and Sunday (isRestDay).
//
// hris.day_late_undertime (migration 094) mirrors this clause for clause for
// the stored columns and the VL auto-deduction. Change both together.
export function dayLateUndertime(
  dutyDate: string,
  sched: ScheduleLike,
  slots: DaySlotTimes,
  opts: {
    reasons?: SlotReasonFlags;
    /** The morning is excused wholesale — a full/AM holiday, or a day-level
     *  reason like OFF. */
    excuseAm?: boolean;
    excusePm?: boolean;
    /** Whether the employee's schedule makes this a rest day (see
     *  resolveDaySchedule). Defaults to Saturday/Sunday. */
    restDay?: boolean;
  } = {},
): DayMinutes {
  const r = opts.reasons ?? {};
  const { excuseAm = false, excusePm = false } = opts;

  if (opts.restDay ?? isRestDay(dutyDate)) {
    return { lateMinutes: 0, undertimeMinutes: 0 };
  }
  if (
    !slots.time_in_am &&
    !slots.time_out_am &&
    !slots.time_in_pm &&
    !slots.time_out_pm
  ) {
    return { lateMinutes: 0, undertimeMinutes: 0 };
  }

  const lateMinutes =
    excuseAm || r.in_am
      ? 0
      : lateMinutesFor(
          dutyDate,
          sched,
          slots.time_in_am,
          slots.time_in_am_next_day ?? false,
        );

  let undertimeMinutes = 0;
  if (hasBreak(sched)) {
    const amBlank = !slots.time_in_am && !slots.time_out_am;
    const pmBlank = !slots.time_in_pm && !slots.time_out_pm;
    if (amBlank && !(excuseAm || r.in_am || r.out_am)) {
      undertimeMinutes += HALF_DAY_UNDERTIME_MINUTES;
    }
    if (pmBlank && !(excusePm || r.in_pm || r.out_pm)) {
      undertimeMinutes += HALF_DAY_UNDERTIME_MINUTES;
    }
  }
  if (!excusePm) {
    // Early departure, measured only when there is a departure to measure.
    if (!r.out_pm && slots.time_out_pm) {
      undertimeMinutes += undertimeMinutesFor(
        dutyDate,
        sched,
        slots.time_out_pm,
        slots.time_out_pm_next_day ?? false,
        true,
      );
    }
    // A late return from lunch is afternoon service not rendered. Zero for a
    // schedule with no break.
    if (!r.in_pm) {
      undertimeMinutes += pmLateMinutesFor(
        dutyDate,
        sched,
        slots.time_in_pm,
        slots.time_in_pm_next_day ?? false,
      );
    }
  }

  return { lateMinutes, undertimeMinutes };
}

export type SlotKey = "in_am" | "out_am" | "in_pm" | "out_pm";

// The blank cells of a day that the employee still has to settle.
//
// Only a day with at least one punch can be unsettled — a day with none is an
// absence — and never a rest day, which owes nothing. A session is explained
// wholesale by excuseAm / excusePm or by a reason on either of its slots (NO
// BREAK on the two lunch slots settles a day worked straight through). On a
// schedule with no break the AM-out and PM-in cells are blank by design; only a
// missing clock-in or clock-out is unsettled there.
export function unsettledSlots(
  dutyDate: string,
  sched: ScheduleLike,
  slots: DaySlotTimes,
  opts: {
    reasons?: SlotReasonFlags;
    excuseAm?: boolean;
    excusePm?: boolean;
    restDay?: boolean;
  } = {},
): SlotKey[] {
  const r = opts.reasons ?? {};
  const { excuseAm = false, excusePm = false } = opts;
  if (opts.restDay ?? isRestDay(dutyDate)) return [];
  const has: Record<SlotKey, boolean> = {
    in_am: !!slots.time_in_am,
    out_am: !!slots.time_out_am,
    in_pm: !!slots.time_in_pm,
    out_pm: !!slots.time_out_pm,
  };
  if (!has.in_am && !has.out_am && !has.in_pm && !has.out_pm) return [];

  const missing: SlotKey[] = [];
  if (!hasBreak(sched)) {
    if (!has.in_am && !excuseAm && !r.in_am) missing.push("in_am");
    if (!has.out_pm && !excusePm && !r.out_pm) missing.push("out_pm");
    return missing;
  }
  if (!(excuseAm || r.in_am || r.out_am)) {
    if (!has.in_am) missing.push("in_am");
    if (!has.out_am) missing.push("out_am");
  }
  if (!(excusePm || r.in_pm || r.out_pm)) {
    if (!has.in_pm) missing.push("in_pm");
    if (!has.out_pm) missing.push("out_pm");
  }
  return missing;
}

// DTR undertime ceiling. A standard workday is 8 hours, so a day's charged
// undertime is capped at 7 hours. A day with NO attendance at all is an absence
// and is charged the full eight (UNDERTIME_ABSENT_MINUTES) instead.
export const UNDERTIME_CAP_MINUTES = 7 * 60; // 420
export const UNDERTIME_ABSENT_MINUTES = 8 * 60; // 480

// Applies the cap to a day's already-excused late + undertime minutes.
//
// This used to reclassify any day reaching 8 hours of undertime as ABSENT and
// hide its punches. A day with punches has at most one fully blank session (4
// hours), so the only days that still measure that much are real punches
// scored against the wrong schedule — a night shift on a day schedule — and
// those must print so the officer can pin the right schedule. A day with punches is never an absence; only a row
// already marked absent (no punches) stays one.
export function applyUndertimeAbsenceRule(
  lateMins: number,
  undertimeMins: number,
  alreadyAbsent: boolean,
): { lateMins: number; undertimeMins: number; absent: boolean } {
  return {
    lateMins,
    undertimeMins: Math.min(undertimeMins, UNDERTIME_CAP_MINUTES),
    absent: alreadyAbsent,
  };
}

// The charge for a day with NO attendance row and no approved leave — nothing
// was recorded, so both sessions are unaccounted. A weekday is an absence (the
// full eight hours). A half-day holiday excuses one session, so the day is not
// an absence, but the other session is still owed and, with nothing recorded
// for it, is charged a flat half day (HALF_DAY_UNDERTIME_MINUTES). A rest day owes
// nothing. Full holidays never reach here — the DTR prints them first.
export function unrecordedDayCharge(
  dutyDate: string,
  halfDayHoliday: boolean,
  opts: { restDay?: boolean } = {},
): { absent: boolean; undertimeMinutes: number } {
  if (opts.restDay ?? isRestDay(dutyDate)) return { absent: false, undertimeMinutes: 0 };
  if (halfDayHoliday) {
    return { absent: false, undertimeMinutes: HALF_DAY_UNDERTIME_MINUTES };
  }
  return { absent: true, undertimeMinutes: 2 * HALF_DAY_UNDERTIME_MINUTES };
}

// Late = minutes the actual clock-in (or single in for no-break shifts) was
// past time_in. Returns 0 when there is no clock-in record.
export function lateMinutesFor(
  dutyDate: string,
  sched: ScheduleLike,
  clockInTime: string | null,
  clockInOnNextDay: boolean,
): number {
  if (!clockInTime) return 0;
  const scheduledMs = new Date(`${dutyDate}T${hhmm(sched.time_in)}:00`).getTime();
  const actualDate = clockInOnNextDay ? addDaysIso(dutyDate, 1) : dutyDate;
  const actualMs = new Date(`${actualDate}T${hhmm(clockInTime)}:00`).getTime();
  return Math.max(0, Math.round((actualMs - scheduledMs) / 60000));
}

// PM late = minutes the actual return from lunch (time_in_pm) was past the
// scheduled break_end. Only meaningful for has-break schedules; returns 0 for
// no-break shifts or when there is no PM clock-in. This is afternoon service
// not rendered, so the DTR charges it as undertime.
export function pmLateMinutesFor(
  dutyDate: string,
  sched: ScheduleLike,
  clockInPmTime: string | null,
  clockInPmOnNextDay: boolean,
): number {
  if (!hasBreak(sched) || !clockInPmTime) return 0;
  const scheduledMs = shiftMomentMs(dutyDate, sched, sched.break_end!);
  const actualDate = clockInPmOnNextDay ? addDaysIso(dutyDate, 1) : dutyDate;
  const actualMs = new Date(`${actualDate}T${hhmm(clockInPmTime)}:00`).getTime();
  return Math.max(0, Math.round((actualMs - scheduledMs) / 60000));
}

// Undertime = minutes the actual clock-out was earlier than time_out, PLUS any
// late return from lunch (see pmLateMinutesFor). For no-break shifts the out is
// stored in time_out_pm.
// When clockOutTime is null but the employee was present (clockedIn = true),
// the missing PM session is counted as undertime:
//   - Has-break schedule: break_end → time_out (e.g. 1 PM → 5 PM = 4 hrs)
//   - No-break shift: time_in → time_out (full shift)
// The missing-clock-out window already spans from break_end, so the PM-late
// component is NOT added there — it would double-charge the same afternoon.
export function undertimeMinutesFor(
  dutyDate: string,
  sched: ScheduleLike,
  clockOutTime: string | null,
  clockOutOnNextDay: boolean,
  clockedIn = false,
  clockInPmTime: string | null = null,
  clockInPmOnNextDay = false,
): number {
  const scheduledDate = crossesMidnight(sched)
    ? addDaysIso(dutyDate, 1)
    : dutyDate;
  const scheduledMs = new Date(`${scheduledDate}T${hhmm(sched.time_out)}:00`).getTime();
  if (!clockOutTime) {
    if (!clockedIn) return 0;
    // For has-break schedules the uncovered window is break_end → time_out.
    // For no-break shifts it's the whole shift: time_in → time_out.
    const baselineTime = sched.break_end ? hhmm(sched.break_end) : hhmm(sched.time_in);
    const baselineMs = new Date(`${dutyDate}T${baselineTime}:00`).getTime();
    return Math.max(0, Math.round((scheduledMs - baselineMs) / 60000));
  }
  const actualDate = clockOutOnNextDay ? addDaysIso(dutyDate, 1) : dutyDate;
  const actualMs = new Date(`${actualDate}T${hhmm(clockOutTime)}:00`).getTime();
  const earlyDeparture = Math.max(0, Math.round((scheduledMs - actualMs) / 60000));
  const pmLate = pmLateMinutesFor(
    dutyDate,
    sched,
    clockInPmTime,
    clockInPmOnNextDay,
  );
  return earlyDeparture + pmLate;
}
