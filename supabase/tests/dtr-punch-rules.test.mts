// The punch-sorting and charging rules agreed with the HR office (Oct 2026).
//
// Sorting (bucketPunchesForDuty):
//   * An arrival keeps the EARLIEST punch; a departure keeps the LATEST.
//   * A punch after an arrival is a departure only when it is past the middle
//     of that session OR more than 60 minutes after the arrival. Otherwise it
//     is a re-scan of the arrival and is dropped — 7:30 / 7:57 / 8:01 is one
//     arrival at 7:30, and 8:01 is never the AM departure.
//   * A single lunch punch goes to whichever scheduled time it is nearer:
//     break start (AM departure) or break end (PM arrival).
//   * Device labels do not decide slots. An employee who logs in at one device
//     and out at another gets "Check In" on both.
//
// Charging (dayLateUndertime / unsettledSlots):
//   * A session (morning = AM in/out, afternoon = PM in/out) with BOTH cells
//     blank is charged a flat half day, 4 hours, unless excused or explained.
//   * A session with ONE blank cell costs nothing. That cell is UNSETTLED — the
//     employee settles it through a correction.
//   * A day with no punches at all is an absence (charged elsewhere).
//   * The punches that are there are still measured (lateness, a late return
//     from lunch, an early departure).
//   * On a schedule with no noon break, the AM-out and PM-in cells are blank by
//     design and are not unsettled; a missing in or out is.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyUndertimeAbsenceRule,
  bucketPunchesForDuty,
  dayLateUndertime,
  unsettledSlots,
  type ScheduleLike,
} from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};
// Split shift: 4:00–8:00 and 13:00–17:00, modelled as a long "break".
const SPLIT: ScheduleLike = {
  id: "split",
  time_in: "04:00",
  time_out: "17:00",
  break_start: "08:00",
  break_end: "13:00",
};
const NIGHT_NO_BREAK: ScheduleLike = {
  id: "night",
  time_in: "22:00",
  time_out: "06:00",
  break_start: null,
  break_end: null,
};
const DAY_NO_BREAK: ScheduleLike = {
  id: "nobreak",
  time_in: "08:00",
  time_out: "16:00",
  break_start: null,
  break_end: null,
};

const D = "2026-10-21"; // Wednesday
const D1 = "2026-10-22";
const SAT = "2026-10-24";

const at = (time: string, status = "", date = D) => ({ date, time, status });

function sort(sched: ScheduleLike, punches: ReturnType<typeof at>[], duty = D) {
  const b = bucketPunchesForDuty(punches, duty, sched);
  return [b.time_in_am, b.time_out_am, b.time_in_pm, b.time_out_pm];
}

// ── Sorting: the morning ────────────────────────────────────────────

test("re-scans at 7:30 / 7:57 / 8:01 are one arrival; 12:01 is the AM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:30"), at("07:57"), at("08:01"), at("12:01")]),
    ["07:30", "12:01", null, null],
  );
});

test("forgot the noon punch: AM out stays blank, 8:01 is not a departure", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:30"), at("07:57"), at("08:01")]),
    ["07:30", null, null, null],
  );
});

test("7:50 then 7:59 is one arrival, not IN 7:50 / OUT 7:59", () => {
  assert.deepEqual(sort(REGULAR, [at("07:50"), at("07:59")]), ["07:50", null, null, null]);
});

test("arrival re-scans with no lunch punches and a 17:02 out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:30"), at("07:57"), at("08:01"), at("17:02")]),
    ["07:30", null, null, "17:02"],
  );
});

test("a genuine early departure more than 60 minutes after arriving is kept", () => {
  assert.deepEqual(sort(REGULAR, [at("08:00"), at("09:30")]), ["08:00", "09:30", null, null]);
});

test("a late arrival before lunch is still the AM arrival", () => {
  assert.deepEqual(
    sort(REGULAR, [at("10:30"), at("12:01"), at("12:58"), at("17:00")]),
    ["10:30", "12:01", "12:58", "17:00"],
  );
});

// ── Sorting: lunch ──────────────────────────────────────────────────

test("in and out with no lunch punches: AM in and PM out only", () => {
  assert.deepEqual(sort(REGULAR, [at("08:00"), at("17:02")]), ["08:00", null, null, "17:02"]);
});

test("the AM out keeps the latest punch of the lunch-out re-scans", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:58"), at("12:01"), at("12:03"), at("12:58"), at("17:02")]),
    ["07:58", "12:03", "12:58", "17:02"],
  );
});

test("an early return from lunch is the PM arrival", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:58"), at("12:01"), at("12:40"), at("17:02")]),
    ["07:58", "12:01", "12:40", "17:02"],
  );
});

test("a lone lunch punch nearer break end is the PM arrival, not the AM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("08:00"), at("12:58"), at("17:02")]),
    ["08:00", null, "12:58", "17:02"],
  );
});

test("a lone lunch punch nearer break start is the AM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("08:00"), at("12:05"), at("17:02")]),
    ["08:00", "12:05", null, "17:02"],
  );
});

// ── Sorting: the afternoon ──────────────────────────────────────────

test("a re-scan right after the lunch return is not the PM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:58"), at("12:01"), at("12:58"), at("13:05")]),
    ["07:58", "12:01", "12:58", null],
  );
});

test("the PM out keeps the latest departure punch", () => {
  assert.deepEqual(
    sort(REGULAR, [
      at("07:58"), at("12:01"), at("12:58"), at("16:58"), at("17:02"), at("17:05"),
    ]),
    ["07:58", "12:01", "12:58", "17:05"],
  );
});

test("leaving sick at 14:30, over an hour after returning, is the PM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:58"), at("12:01"), at("12:58"), at("14:30")]),
    ["07:58", "12:01", "12:58", "14:30"],
  );
});

test("absent in the morning: 12:45 / 17:02 are the PM in and out", () => {
  assert.deepEqual(sort(REGULAR, [at("12:45"), at("17:02")]), [null, null, "12:45", "17:02"]);
});

test("absent in the morning: a lone 17:05 is the PM out", () => {
  assert.deepEqual(sort(REGULAR, [at("17:05")]), [null, null, null, "17:05"]);
});

// ── Sorting: devices ────────────────────────────────────────────────

test("device labels do not decide the slot (two devices, both 'check in')", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:55", "check in"), at("17:02", "check in")]),
    ["07:55", null, null, "17:02"],
  );
});

test("a mislabeled lunch return does not become the PM out", () => {
  assert.deepEqual(
    sort(REGULAR, [at("07:58", "check in"), at("12:01", "break out"), at("12:57", "check out")]),
    ["07:58", "12:01", "12:57", null],
  );
});

// ── Sorting: other shapes ───────────────────────────────────────────

test("split shift 4–8 / 1–5 fills all four cells", () => {
  assert.deepEqual(
    sort(SPLIT, [at("03:55"), at("04:03"), at("08:02"), at("12:55"), at("17:01")]),
    ["03:55", "08:02", "12:55", "17:01"],
  );
});

test("night shift 22:00–06:00 with no break: in and next-day out", () => {
  const b = bucketPunchesForDuty([at("21:56"), at("06:03", "", D1)], D, NIGHT_NO_BREAK);
  assert.equal(b.time_in_am, "21:56");
  assert.equal(b.time_out_pm, "06:03");
  assert.equal(b.time_out_pm_next_day, true);
  assert.equal(b.time_out_am, null);
  assert.equal(b.time_in_pm, null);
});

test("night shift re-scan at 22:05 is not the clock-out", () => {
  assert.deepEqual(sort(NIGHT_NO_BREAK, [at("22:00"), at("22:05")]), ["22:00", null, null, null]);
});

test("night shift: a lone next-morning punch is the clock-out", () => {
  const b = bucketPunchesForDuty([at("06:03", "", D1)], D, NIGHT_NO_BREAK);
  assert.equal(b.time_in_am, null);
  assert.equal(b.time_out_pm, "06:03");
});

test("no-break day shift keeps first in and last out", () => {
  assert.deepEqual(
    sort(DAY_NO_BREAK, [at("07:55"), at("15:58"), at("16:02")]),
    ["07:55", null, null, "16:02"],
  );
});

// ── Charging ────────────────────────────────────────────────────────

const day = (s: [string | null, string | null, string | null, string | null]) => ({
  time_in_am: s[0],
  time_out_am: s[1],
  time_in_pm: s[2],
  time_out_pm: s[3],
});

test("in and out with no lunch punches charges nothing", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:00", null, null, "17:02"])), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

test("a forgotten PM out (one blank cell) charges nothing", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:00", "12:00", "13:00", null])), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

test("an incomplete morning still measures the lateness it has", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:30", null, null, "17:00"])), {
    lateMinutes: 30,
    undertimeMinutes: 0,
  });
});

test("a complete day is charged exactly as before", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:15", "12:00", "13:10", "16:50"])), {
    lateMinutes: 15,
    undertimeMinutes: 20,
  });
});

test("an early departure is measured even when lunch is blank", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:00", null, null, "16:30"])), {
    lateMinutes: 0,
    undertimeMinutes: 30,
  });
});

test("a fully blank afternoon is charged 4 hours", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["07:30", "12:01", null, null])), {
    lateMinutes: 0,
    undertimeMinutes: 240,
  });
});

test("a fully blank morning is charged 4 hours, plus what the afternoon shows", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day([null, null, "13:10", "16:50"])), {
    lateMinutes: 0,
    undertimeMinutes: 240 + 10 + 10,
  });
});

test("an arrival only: the morning is unsettled, the blank afternoon is 4 hours", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day(["08:15", null, null, null])), {
    lateMinutes: 15,
    undertimeMinutes: 240,
  });
});

test("a reason on a blank session waives its 4 hours", () => {
  assert.deepEqual(
    dayLateUndertime(D, REGULAR, day(["08:00", "12:00", null, null]), {
      reasons: { in_pm: true, out_pm: true },
    }),
    { lateMinutes: 0, undertimeMinutes: 0 },
  );
});

test("a half-day holiday excuses its blank session", () => {
  assert.deepEqual(
    dayLateUndertime(D, REGULAR, day([null, null, "13:00", "17:00"]), { excuseAm: true }),
    { lateMinutes: 0, undertimeMinutes: 0 },
  );
});

test("a day with no punches at all is not charged here (it is an absence)", () => {
  assert.deepEqual(dayLateUndertime(D, REGULAR, day([null, null, null, null])), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

test("a blank session on a rest day costs nothing", () => {
  assert.deepEqual(dayLateUndertime(SAT, REGULAR, day(["08:00", "12:00", null, null])), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

test("a no-break shift has no half to charge", () => {
  assert.deepEqual(dayLateUndertime(D, DAY_NO_BREAK, day(["08:00", null, null, null])), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

test("a no-break shift with no clock-out is not charged the whole shift", () => {
  assert.deepEqual(dayLateUndertime(D, NIGHT_NO_BREAK, day(["22:10", null, null, null])), {
    lateMinutes: 10,
    undertimeMinutes: 0,
  });
});

// ── Unsettled ───────────────────────────────────────────────────────

test("missing lunch punches are unsettled", () => {
  assert.deepEqual(unsettledSlots(D, REGULAR, day(["08:00", null, null, "17:02"])), [
    "out_am",
    "in_pm",
  ]);
});

test("a forgotten PM out is unsettled", () => {
  assert.deepEqual(unsettledSlots(D, REGULAR, day(["08:00", "12:00", "13:00", null])), [
    "out_pm",
  ]);
});

test("a complete day is settled", () => {
  assert.deepEqual(unsettledSlots(D, REGULAR, day(["08:00", "12:00", "13:00", "17:00"])), []);
});

test("a reason on the session settles its blank cells", () => {
  assert.deepEqual(
    unsettledSlots(D, REGULAR, day(["08:00", null, null, "17:00"]), {
      reasons: { out_am: true, in_pm: true },
    }),
    [],
  );
});

test("an excused session (half-day holiday) is settled", () => {
  assert.deepEqual(
    unsettledSlots(D, REGULAR, day([null, null, "13:00", "17:00"]), { excuseAm: true }),
    [],
  );
});

test("a no-break schedule's empty lunch cells are not unsettled", () => {
  assert.deepEqual(
    unsettledSlots(D, NIGHT_NO_BREAK, day(["22:00", null, null, "06:00"])),
    [],
  );
});

test("a no-break schedule with no clock-out is unsettled", () => {
  assert.deepEqual(unsettledSlots(D, NIGHT_NO_BREAK, day(["22:00", null, null, null])), [
    "out_pm",
  ]);
});

test("a day with no punches is an absence, not unsettled", () => {
  assert.deepEqual(unsettledSlots(D, REGULAR, day([null, null, null, null])), []);
});

test("a rest day owes nothing, so nothing on it is unsettled", () => {
  assert.deepEqual(unsettledSlots(SAT, REGULAR, day(["08:00", null, null, null])), []);
});

// ── Absence ─────────────────────────────────────────────────────────

test("a day with punches is never turned into an absence by its undertime", () => {
  // A night shift measured against a day schedule: absurd numbers, but the
  // punches are real and must still print. The cap keeps the charge sane.
  assert.deepEqual(applyUndertimeAbsenceRule(835, 655, false), {
    lateMins: 835,
    undertimeMins: 420,
    absent: false,
  });
});

test("a row already marked absent stays absent", () => {
  assert.equal(applyUndertimeAbsenceRule(0, 0, true).absent, true);
});

// ── Rest days decided by the schedule (Phase 2) ─────────────────────

import { unrecordedDayCharge } from "../../src/lib/attendance-schedule.ts";

test("a rostered Saturday is charged like any workday", () => {
  assert.deepEqual(
    dayLateUndertime(SAT, REGULAR, day(["08:10", "12:00", null, null]), { restDay: false }),
    { lateMinutes: 10, undertimeMinutes: 240 },
  );
  assert.deepEqual(
    unsettledSlots(SAT, REGULAR, day(["08:00", null, null, "17:00"]), { restDay: false }),
    ["out_am", "in_pm"],
  );
});

test("a weekday the schedule makes a rest day owes nothing", () => {
  assert.deepEqual(
    dayLateUndertime(D, REGULAR, day(["08:10", "12:00", null, null]), { restDay: true }),
    { lateMinutes: 0, undertimeMinutes: 0 },
  );
  assert.deepEqual(
    unsettledSlots(D, REGULAR, day(["08:00", null, null, null]), { restDay: true }),
    [],
  );
});

test("an unrecorded day follows the schedule's rest day, not the weekday", () => {
  assert.deepEqual(unrecordedDayCharge(SAT, false, { restDay: false }), {
    absent: true,
    undertimeMinutes: 480,
  });
  assert.deepEqual(unrecordedDayCharge(D, false, { restDay: true }), {
    absent: false,
    undertimeMinutes: 0,
  });
});
