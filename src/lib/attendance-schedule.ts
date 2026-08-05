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
  // Absolute ms timestamp — used for sorting and bucket assignment.
  ms: number;
  // Normalized Dahua attendance status: "checkin" | "breakout" | "breakin" |
  // "checkout" | "" (when the source had no usable label, e.g. CSV imports).
  status: string;
}

// Maps a normalized Dahua attendance status to the AM/PM slot it represents.
const STATUS_SLOT: Record<
  string,
  "in_am" | "out_am" | "in_pm" | "out_pm" | undefined
> = {
  checkin: "in_am",
  breakout: "out_am",
  breakin: "in_pm",
  checkout: "out_pm",
};

function normPunchStatus(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s_-]+/g, "").toLowerCase();
}

// When every punch carries a recognized Dahua label, assign slots by the
// device's own intent rather than by time window. This is immune to re-scans
// landing a minute on the wrong side of the break boundary.
//   time_in_am  = earliest Check In       time_out_pm = latest Check Out
// The two midday break punches are treated as ONE ordered group, NOT split by
// their Break Out / Break In label — the device frequently tags the return from
// lunch as "Break Out" too (it doesn't reliably distinguish leaving from
// returning). So the earliest break punch is the AM departure (left for lunch)
// and the latest is the PM arrival (came back):
//   time_out_am = earliest break punch    time_in_pm  = latest break punch
// `punches` must be pre-sorted ascending by ms. `dutyDate`/`sched` are used only
// to locate the PM midpoint when rescuing a mislabeled end-of-day punch (below).
function bucketByStatus(
  punches: Punch[],
  dutyDate: string,
  sched: ScheduleLike,
): BucketResult {
  const inSlot = (slot: string) =>
    punches.filter((p) => STATUS_SLOT[p.status] === slot);
  const first = (arr: Punch[]) => arr[0] ?? null;
  const last = (arr: Punch[]) => arr[arr.length - 1] ?? null;

  const inAm = first(inSlot("in_am"));
  let outPm = last(inSlot("out_pm"));

  // Break Out + Break In merged and ordered; earliest = out, latest = in.
  const breaks = punches.filter((p) => {
    const slot = STATUS_SLOT[p.status];
    return slot === "out_am" || slot === "in_pm";
  });

  // The device labels punches by ORDER (Check In / Break Out / Break In / Check
  // Out), so on an early-release day the final logout comes through as a Break
  // punch instead of a Check Out — no out_pm punch exists, and the merged break
  // group ends with what is really the DEPARTURE. If the employee was present
  // earlier in the day and that last break punch lands past the PM midpoint
  // (nobody returns from lunch at 3PM), rescue it as time_out_pm and let the
  // remaining break punches supply the real AM-out / PM-in. Without this the
  // 3PM logout prints as the PM arrival, PM out stays blank, and the whole
  // afternoon is charged as un-clocked-out undertime. The midpoint mirrors the
  // window path's lone-PM heuristic; a genuine (early) lunch return stays put.
  if (!outPm && (inAm || breaks.length > 1) && breaks.length > 0) {
    const pmMidpointMs =
      (shiftMomentMs(dutyDate, sched, sched.break_end!) +
        shiftMomentMs(dutyDate, sched, sched.time_out)) /
      2;
    const lastBreak = breaks[breaks.length - 1];
    if (lastBreak.ms >= pmMidpointMs) {
      outPm = lastBreak;
      breaks.pop();
    }
  }

  // "Earliest break punch = left for lunch" only holds if the employee was
  // HERE in the morning. With no Check In, they were absent/on leave in the AM
  // and arrived at midday, so the first break punch is the PM ARRIVAL — not a
  // departure from a lunch they never took. Recording it as time_out_am would
  // print a phantom AM departure and leave the real arrival blank.
  const outAm = inAm ? (breaks.length > 0 ? breaks[0] : null) : null;
  const inPm = inAm
    ? breaks.length > 1
      ? breaks[breaks.length - 1]
      : null
    : breaks.length > 0
      ? breaks[0]
      : null;

  return {
    time_in_am: inAm?.time ?? null,
    time_in_am_next_day: inAm?.onNextDay ?? false,
    time_out_am: outAm?.time ?? null,
    time_out_am_next_day: outAm?.onNextDay ?? false,
    time_in_pm: inPm?.time ?? null,
    time_in_pm_next_day: inPm?.onNextDay ?? false,
    time_out_pm: outPm?.time ?? null,
    time_out_pm_next_day: outPm?.onNextDay ?? false,
  };
}

// Buckets a set of raw punches for one duty date into AM/PM slots given the
// employee's schedule. For schedules with no break, the in-punch goes to
// `time_in_am` and the out-punch to `time_out_pm` (the other two stay null);
// downstream DTR code looks at the schedule to decide column layout.
export function bucketPunchesForDuty(
  punchesByActualDate: { date: string; time: string; status?: string | null }[],
  dutyDate: string,
  sched: ScheduleLike,
): BucketResult {
  if (punchesByActualDate.length === 0) return emptyBucket();

  const punches: Punch[] = punchesByActualDate.map((p) => {
    const onNextDay = p.date !== dutyDate;
    return {
      time: p.time,
      onNextDay,
      ms: new Date(`${p.date}T${p.time}:00`).getTime(),
      status: normPunchStatus(p.status),
    };
  });
  punches.sort((a, b) => a.ms - b.ms);

  // --- Status-first path (break schedules) ---
  // Only when every punch is a recognized Check In/Break Out/Break In/Check Out
  // label AND the day actually carries at least one break punch; otherwise fall
  // through to time-window bucketing. No-break shifts use the window path, where
  // earliest-in / latest-out already pick the endpoints.
  //
  // Some Dahua devices only ever emit "Check In"/"Check Out" — they never label
  // the midday lunch scans as Break Out/Break In. For those, the labels are
  // technically all "recognized" but carry no AM-out/PM-in information, so
  // trusting them would collapse the lunch pair into the first-in / last-out and
  // leave AM-out + PM-in blank. Requiring a real break punch routes those days
  // to the time-window path, which splits the 12:08 lunch-out / 12:5x lunch-in
  // correctly by the schedule's break window.
  const hasBreakPunch = punches.some(
    (p) => STATUS_SLOT[p.status] === "out_am" || STATUS_SLOT[p.status] === "in_pm",
  );
  if (
    hasBreak(sched) &&
    hasBreakPunch &&
    punches.every((p) => STATUS_SLOT[p.status])
  ) {
    return bucketByStatus(punches, dutyDate, sched);
  }

  // --- No-break path: single in/out ---
  if (!hasBreak(sched)) {
    const first = punches[0];
    const last = punches[punches.length - 1];
    return {
      time_in_am: first.time,
      time_in_am_next_day: first.onNextDay,
      time_out_am: null,
      time_out_am_next_day: false,
      time_in_pm: null,
      time_in_pm_next_day: false,
      time_out_pm: punches.length > 1 ? last.time : null,
      time_out_pm_next_day: punches.length > 1 ? last.onNextDay : false,
    };
  }

  // --- Has-break path: split by break window ---
  const breakStartMs = shiftMomentMs(dutyDate, sched, sched.break_start!);
  const breakEndMs = shiftMomentMs(dutyDate, sched, sched.break_end!);

  const am: Punch[] = [];
  const mid: Punch[] = [];
  const pm: Punch[] = [];
  for (const p of punches) {
    if (p.ms < breakStartMs) am.push(p);
    else if (p.ms < breakEndMs) mid.push(p);
    else pm.push(p);
  }
  // Punches inside the break window are lunch punches — but only for someone
  // who was here in the morning. With an AM arrival, the first goes to AM-out
  // (if missing) and the rest to PM (the last becoming PM-in if missing).
  //
  // With NO morning punch the employee was absent/on leave in the AM and simply
  // arrived at midday, so every break-window punch is a PM punch. Pushing one
  // into the empty AM bucket is what made a lone 12:45 arrival print as AM
  // Arrival and read as ~4.75 hours late.
  if (mid.length > 0) {
    if (am.length > 0) {
      if (am.length < 2) am.push(mid[0]);
      if (mid.length > 1) pm.unshift(mid[mid.length - 1]);
    } else {
      pm.unshift(...mid);
    }
  }

  const amFirst = am[0];
  const amLast = am.length > 1 ? am[am.length - 1] : null;

  // A lone PM punch is ambiguous: it is either the return from lunch (arrival)
  // or the end of the day (departure). Trust the device's own label when it
  // carries one; otherwise split on the midpoint of the PM session, so a 17:05
  // punch reads as the departure it plainly is rather than an arrival that
  // leaves time_out_pm blank and charges a phantom half-day of undertime.
  let pmFirst: Punch | null = null;
  let pmLast: Punch | null = null;
  if (pm.length > 1) {
    pmFirst = pm[0];
    pmLast = pm[pm.length - 1];
  } else if (pm.length === 1) {
    const only = pm[0];
    const slot = STATUS_SLOT[only.status];
    const pmMidpointMs =
      (breakEndMs + shiftMomentMs(dutyDate, sched, sched.time_out)) / 2;
    const isDeparture =
      slot === "out_pm" ? true : slot === "in_pm" ? false : only.ms >= pmMidpointMs;
    if (isDeparture) pmLast = only;
    else pmFirst = only;
  }

  return {
    time_in_am: amFirst?.time ?? null,
    time_in_am_next_day: amFirst?.onNextDay ?? false,
    time_out_am: amLast?.time ?? null,
    time_out_am_next_day: amLast?.onNextDay ?? false,
    time_in_pm: pmFirst?.time ?? null,
    time_in_pm_next_day: pmFirst?.onNextDay ?? false,
    time_out_pm: pmLast?.time ?? null,
    time_out_pm_next_day: pmLast?.onNextDay ?? false,
  };
}

// A half day. An LGU workday is two sessions — morning and afternoon — and a
// session missing either of its two punches is charged as a whole half day,
// flat, whatever the schedule's actual shape. Deliberately NOT derived from
// time_in → break_start: a 7:30–16:30 schedule still charges 4:00 for an
// unaccounted morning, because the DTR's unit of undertime is the half day.
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
// The rule, for a schedule with a break: a session (morning = AM in/out,
// afternoon = PM in/out) that does not carry BOTH its punches rendered no
// verifiable service, and is charged a flat half day. A DTR cell cannot be
// blank and cost nothing — that is what let a missing lunch scan, or an
// afternoon with a departure but no arrival, pass as a full day's work.
//
// The flat charge SUPERSEDES that session's per-minute charges: a morning
// already billed as four unaccounted hours is not also billed for arriving
// late, which would put more than four hours of penalty on a four-hour
// session. A complete session is charged exactly what it was charged before —
// lateness against time_in, early departure against time_out, and a late
// return from lunch against break_end.
//
// A reason on either of a session's slots explains the missing punch, so the
// flat charge does not apply; the punches that ARE there are still measured,
// so tagging the two lunch slots NO BREAK on a day worked straight through
// does not also forgive arriving half an hour late.
//
// Schedules with no break keep their existing treatment — a single in/out pair
// has no half to charge, and a missing clock-out bills the whole shift.
//
// On a REST DAY (see isRestDay) none of the flat charges apply. No hours are
// owed, so an incomplete session is not a session unrendered — there is nothing
// for the half day to be charged against, and a day with a single stray scan is
// not eight hours of absence. What CAN still be measured is measured: a session
// carrying both its punches is scored for lateness and early departure exactly
// as on a weekday, so an employee who does report for weekend duty is still
// held to the hours they actually recorded.
//
// Late and undertime are returned together because the two now interact: split
// across two functions, every caller would have to re-implement the
// supersession rule and they would drift apart.
export function dayLateUndertime(
  dutyDate: string,
  sched: ScheduleLike,
  slots: DaySlotTimes,
  opts: {
    reasons?: SlotReasonFlags;
    /** The morning is excused wholesale — a full/AM holiday, or a day-level
     *  reason like OFF. Suppresses the flat charge AND the per-minute ones. */
    excuseAm?: boolean;
    excusePm?: boolean;
  } = {},
): DayMinutes {
  const r = opts.reasons ?? {};
  const { excuseAm = false, excusePm = false } = opts;
  // Derived here rather than passed in: every caller — the DTR, the summary
  // report, the biometric importer, the corrections apply path — scores the
  // same calendar, so a caller that could forget the flag is a caller that
  // would drift from the printed document.
  const restDay = isRestDay(dutyDate);

  // A day with NO punches at all is an absence, not two incomplete sessions.
  // The absent flag carries it and the DTR charges the full eight hours there
  // (UNDERTIME_ABSENT_MINUTES). Charging 4 + 4 here as well would turn every
  // rest day, holiday and approved leave into an eight-hour undertime.
  if (
    !slots.time_in_am &&
    !slots.time_out_am &&
    !slots.time_in_pm &&
    !slots.time_out_pm
  ) {
    return { lateMinutes: 0, undertimeMinutes: 0 };
  }

  if (!hasBreak(sched)) {
    return {
      lateMinutes:
        excuseAm || r.in_am
          ? 0
          : lateMinutesFor(
              dutyDate,
              sched,
              slots.time_in_am,
              slots.time_in_am_next_day ?? false,
            ),
      undertimeMinutes:
        excusePm || r.out_pm || (restDay && !slots.time_out_pm)
          ? 0
          : undertimeMinutesFor(
              dutyDate,
              sched,
              slots.time_out_pm,
              slots.time_out_pm_next_day ?? false,
              !!slots.time_in_am,
            ),
    };
  }

  let lateMinutes = 0;
  let undertimeMinutes = 0;

  // --- morning ---
  //
  // `|| restDay` on amExplained drops the flat half day; `amComplete ||
  // !restDay` on the measuring branch is the other half of the same rule. On a
  // rest day an INCOMPLETE morning is not scored at all: with no departure
  // there is no session to measure, and charging its lateness alone would bill
  // an employee for a weekend nothing could roster them onto. A weekday still
  // measures it — there the missing punch is explained by a reason, and an
  // explained lunch scan must not also forgive arriving half an hour late.
  const amComplete = !!slots.time_in_am && !!slots.time_out_am;
  const amExplained = excuseAm || !!r.in_am || !!r.out_am || restDay;
  if (!amComplete && !amExplained) {
    undertimeMinutes += HALF_DAY_UNDERTIME_MINUTES;
  } else if (!excuseAm && !r.in_am && (amComplete || !restDay)) {
    lateMinutes = lateMinutesFor(
      dutyDate,
      sched,
      slots.time_in_am,
      slots.time_in_am_next_day ?? false,
    );
  }

  // --- afternoon ---
  const pmComplete = !!slots.time_in_pm && !!slots.time_out_pm;
  const pmExplained = excusePm || !!r.in_pm || !!r.out_pm || restDay;
  if (!pmComplete && !pmExplained) {
    undertimeMinutes += HALF_DAY_UNDERTIME_MINUTES;
  } else if (!excusePm && (pmComplete || !restDay)) {
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
    // A late return from lunch is afternoon service not rendered.
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
