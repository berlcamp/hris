// A holidays.type value does two unrelated things, and conflating them is the
// bug this file guards:
//
//   1. It says which SESSIONS are excused from late/undertime on the DTR.
//   2. It says whether the date is a non-working holiday at all — which is what
//      the CTO screens read to suggest the x1.5 day-type multiplier.
//
// 'no_am_deductions' / 'no_pm_deductions' are yes to (1) and no to (2): an
// ordinary working day the org has forgiven one session of. Wire them into the
// wrong predicate and either the waiver silently does nothing, or every
// employee earns COC at holiday rate for a normal working day.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  HOLIDAY_TYPES,
  HOLIDAY_TYPE_LABELS,
  holidayExcusedSessions,
  isNonWorkingHoliday,
  holidayFormSchema,
  type HolidayType,
} from "../../src/lib/validations/holiday-schema.ts";
import {
  dayLateUndertime,
  DEFAULT_SCHEDULE,
} from "../../src/lib/attendance-schedule.ts";

// 08:00–17:00 with a 12:00–13:00 break.
const SCHED = DEFAULT_SCHEDULE;
const DATE = "2026-08-05";

// An hour late in the morning AND an hour early in the afternoon, both
// sessions otherwise complete: 60 min late (AM) + 60 min undertime (PM).
const LATE_BOTH_WAYS = {
  time_in_am: "09:00",
  time_out_am: "12:00",
  time_in_pm: "13:00",
  time_out_pm: "16:00",
};

const minutesFor = (type: HolidayType | null) => {
  const { am, pm } = holidayExcusedSessions(type);
  return dayLateUndertime(DATE, SCHED, LATE_BOTH_WAYS, {
    excuseAm: am,
    excusePm: pm,
  });
};

test("baseline: no calendar entry charges both sessions", () => {
  assert.deepEqual(minutesFor(null), {
    lateMinutes: 60,
    undertimeMinutes: 60,
  });
});

test("no_am_deductions drops the AM late charge, keeps the PM undertime", () => {
  assert.deepEqual(minutesFor("no_am_deductions"), {
    lateMinutes: 0,
    undertimeMinutes: 60,
  });
});

test("no_pm_deductions drops the PM undertime, keeps the AM late charge", () => {
  assert.deepEqual(minutesFor("no_pm_deductions"), {
    lateMinutes: 60,
    undertimeMinutes: 0,
  });
});

test("the waiver types match their half-day holiday counterparts", () => {
  assert.deepEqual(minutesFor("no_am_deductions"), minutesFor("half_am"));
  assert.deepEqual(minutesFor("no_pm_deductions"), minutesFor("half_pm"));
});

test("a full holiday charges neither session", () => {
  assert.deepEqual(minutesFor("full"), {
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
});

// A session excused by the waiver must also skip the flat 240-minute half-day
// charge for an incomplete session — the same supersession a holiday gets.
// Otherwise "no AM deductions" would still bill four hours for a missed lunch
// scan, which is exactly the deduction it exists to forgive.
test("an excused session with a missing punch is not billed the half day", () => {
  const missingAmOut = {
    time_in_am: "09:00",
    time_out_am: null,
    time_in_pm: "13:00",
    time_out_pm: "17:00",
  };
  const { am, pm } = holidayExcusedSessions("no_am_deductions");
  assert.deepEqual(
    dayLateUndertime(DATE, SCHED, missingAmOut, { excuseAm: am, excusePm: pm }),
    { lateMinutes: 0, undertimeMinutes: 0 },
  );
});

test("only the three holiday types count as non-working", () => {
  assert.equal(isNonWorkingHoliday("full"), true);
  assert.equal(isNonWorkingHoliday("half_am"), true);
  assert.equal(isNonWorkingHoliday("half_pm"), true);
  // The waivers are working days: no x1.5 COC, no skipped working-day count.
  assert.equal(isNonWorkingHoliday("no_am_deductions"), false);
  assert.equal(isNonWorkingHoliday("no_pm_deductions"), false);
});

test("every type is selectable in the form and has a label", () => {
  for (const t of HOLIDAY_TYPES) {
    assert.ok(HOLIDAY_TYPE_LABELS[t], `${t} has no label`);
    const parsed = holidayFormSchema.safeParse({
      date: DATE,
      name: "Test",
      type: t,
    });
    assert.equal(parsed.success, true, `${t} rejected by holidayFormSchema`);
  }
  assert.equal(
    holidayFormSchema.safeParse({ date: DATE, name: "Test", type: "bogus" })
      .success,
    false,
  );
});
