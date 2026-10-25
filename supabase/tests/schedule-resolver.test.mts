// Which schedule applies to an employee on a date, and whether it is a rest
// day (Phase 2: rotations and per-date overrides, Oct 2026).
//
// Order, most specific first:
//   1. a schedule pinned on that day by an approved correction (never rest);
//   2. a per-date override — a schedule, or a rest day;
//   3. the rotation in effect — week of the cycle × weekday → schedule or REST;
//   4. the employee's base schedule, Monday to Friday, Saturday/Sunday rest.

import assert from "node:assert/strict";
import test from "node:test";
import {
  dutyDateForPunch,
  resolveDaySchedule,
  rotationWeekFor,
  type RotationDef,
  type ResolveInput,
} from "../../src/lib/schedule-resolver.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const BASE: ScheduleLike = {
  id: "base", time_in: "08:00", time_out: "17:00", break_start: "12:00", break_end: "13:00",
};
const DAY: ScheduleLike = {
  id: "day", time_in: "07:00", time_out: "16:00", break_start: "11:00", break_end: "12:00",
};
const NIGHT: ScheduleLike = {
  id: "night", time_in: "22:00", time_out: "06:00", break_start: null, break_end: null,
};
const schedules = new Map([BASE, DAY, NIGHT].map((s) => [s.id, s]));

// Week 1: Mon–Fri day shift, weekend off.
// Week 2: Sun–Thu night shift, Fri/Sat off.
// ISO weekday: 1 = Monday … 7 = Sunday.
const AB: RotationDef = {
  id: "ab",
  cycle_weeks: 2,
  days: {
    "1-1": "day", "1-2": "day", "1-3": "day", "1-4": "day", "1-5": "day", "1-6": null, "1-7": "night",
    "2-1": "night", "2-2": "night", "2-3": "night", "2-4": "night", "2-5": null, "2-6": null, "2-7": null,
  },
};
// A one-week roster that includes Saturday.
const SAT_ROSTER: RotationDef = {
  id: "sat",
  cycle_weeks: 1,
  days: { "1-1": "day", "1-2": "day", "1-3": "day", "1-4": "day", "1-6": "day" },
};
const rotations = new Map([AB, SAT_ROSTER].map((r) => [r.id, r]));

const input = (over: Partial<ResolveInput> = {}): ResolveInput => ({
  base: BASE,
  schedules,
  rotations,
  assignments: [],
  override: null,
  pin: null,
  ...over,
});

const onAB = { rotation_id: "ab", effective_from: "2026-10-05", start_week: 1 }; // a Monday

// ── no rotation: today's behaviour ──────────────────────────────────

test("no rotation: a weekday uses the base schedule", () => {
  const r = resolveDaySchedule("2026-10-07", input());
  assert.equal(r.sched.id, "base");
  assert.equal(r.restDay, false);
  assert.equal(r.source, "base");
});

test("no rotation: Saturday and Sunday are rest days", () => {
  assert.equal(resolveDaySchedule("2026-10-10", input()).restDay, true);
  assert.equal(resolveDaySchedule("2026-10-11", input()).restDay, true);
});

// ── rotations ───────────────────────────────────────────────────────

test("rotation week is counted from the Monday of the effective date", () => {
  assert.equal(rotationWeekFor("2026-10-05", onAB, 2), 1);
  assert.equal(rotationWeekFor("2026-10-11", onAB, 2), 1); // Sunday, same week
  assert.equal(rotationWeekFor("2026-10-12", onAB, 2), 2);
  assert.equal(rotationWeekFor("2026-10-19", onAB, 2), 1);
});

test("a mid-week effective date still counts from that week's Monday", () => {
  const midWeek = { rotation_id: "ab", effective_from: "2026-10-07", start_week: 1 };
  assert.equal(rotationWeekFor("2026-10-12", midWeek, 2), 2);
});

test("start_week shifts the cycle", () => {
  const fromWeek2 = { ...onAB, start_week: 2 };
  assert.equal(rotationWeekFor("2026-10-05", fromWeek2, 2), 2);
  assert.equal(rotationWeekFor("2026-10-12", fromWeek2, 2), 1);
});

test("the rotation picks the schedule for week and weekday", () => {
  const i = input({ assignments: [onAB] });
  assert.equal(resolveDaySchedule("2026-10-07", i).sched.id, "day"); // wk1 Wed
  assert.equal(resolveDaySchedule("2026-10-14", i).sched.id, "night"); // wk2 Wed
  assert.equal(resolveDaySchedule("2026-10-21", i).sched.id, "day"); // wk1 again
  assert.equal(resolveDaySchedule("2026-10-14", i).source, "rotation");
});

test("REST in the rotation is a rest day, whatever the weekday", () => {
  const i = input({ assignments: [onAB] });
  const fri = resolveDaySchedule("2026-10-16", i); // wk2 Friday
  assert.equal(fri.restDay, true);
  assert.equal(fri.sched.id, "base", "punches on a rest day are read against the base schedule");
});

test("a rostered Saturday is owed", () => {
  const i = input({ assignments: [{ rotation_id: "sat", effective_from: "2026-10-05", start_week: 1 }] });
  const sat = resolveDaySchedule("2026-10-10", i);
  assert.equal(sat.restDay, false);
  assert.equal(sat.sched.id, "day");
  // A weekday the roster leaves empty is a rest day.
  assert.equal(resolveDaySchedule("2026-10-09", i).restDay, true);
});

test("before the assignment takes effect the base schedule applies", () => {
  const r = resolveDaySchedule("2026-10-02", input({ assignments: [onAB] }));
  assert.equal(r.source, "base");
  assert.equal(r.sched.id, "base");
});

test("the latest assignment in effect wins, and a null rotation ends it", () => {
  const i = input({
    assignments: [
      onAB,
      { rotation_id: null, effective_from: "2026-10-19", start_week: 1 },
    ],
  });
  assert.equal(resolveDaySchedule("2026-10-14", i).sched.id, "night");
  const after = resolveDaySchedule("2026-10-21", i);
  assert.equal(after.source, "base");
  assert.equal(after.sched.id, "base");
});

// ── overrides and pins ──────────────────────────────────────────────

test("a per-date override schedule beats the rotation", () => {
  const r = resolveDaySchedule(
    "2026-10-07",
    input({ assignments: [onAB], override: { date: "2026-10-07", schedule_id: "night", is_rest_day: false } }),
  );
  assert.equal(r.sched.id, "night");
  assert.equal(r.source, "override");
  assert.equal(r.restDay, false);
});

test("a per-date rest-day override makes a workday a rest day", () => {
  const r = resolveDaySchedule(
    "2026-10-07",
    input({ override: { date: "2026-10-07", schedule_id: null, is_rest_day: true } }),
  );
  assert.equal(r.restDay, true);
  assert.equal(r.source, "override");
});

test("an override can make a weekend a workday", () => {
  const r = resolveDaySchedule(
    "2026-10-10",
    input({ override: { date: "2026-10-10", schedule_id: "day", is_rest_day: false } }),
  );
  assert.equal(r.restDay, false);
  assert.equal(r.sched.id, "day");
});

test("a correction's pinned schedule beats everything and is never rest", () => {
  const r = resolveDaySchedule(
    "2026-10-10",
    input({
      assignments: [onAB],
      override: { date: "2026-10-10", schedule_id: null, is_rest_day: true },
      pin: NIGHT,
    }),
  );
  assert.equal(r.sched.id, "night");
  assert.equal(r.source, "pin");
  assert.equal(r.restDay, false);
});

// ── which duty day a punch belongs to ───────────────────────────────

const day = (s: ScheduleLike, restDay = false) => ({ sched: s, restDay, source: "base" as const });

test("an early-morning punch after a night shift belongs to the night before", () => {
  assert.equal(dutyDateForPunch("2026-10-15", "06:03", day(NIGHT)), "2026-10-14");
});

test("a morning punch after a day shift stays on its own date", () => {
  assert.equal(dutyDateForPunch("2026-10-15", "08:00", day(DAY)), "2026-10-15");
});

test("a rest day never claims the next morning's punches", () => {
  assert.equal(dutyDateForPunch("2026-10-15", "06:03", day(NIGHT, true)), "2026-10-15");
});

test("an evening punch on a night-shift day stays on its own date", () => {
  assert.equal(dutyDateForPunch("2026-10-15", "21:55", day(NIGHT)), "2026-10-15");
});
