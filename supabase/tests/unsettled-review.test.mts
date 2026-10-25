// The officer's review list: every day with blank cells still to settle, with
// the punches the devices actually recorded for that duty day.

import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewItems, type ReviewPunch } from "../../src/lib/unsettled-review.ts";

const entry = (date: string, cells: (string | null)[], unsettled: string[], extra = {}) => ({
  date,
  day_of_week: "Wednesday",
  time_in_am: cells[0],
  time_out_am: cells[1],
  time_in_pm: cells[2],
  time_out_pm: cells[3],
  late_minutes: 0,
  undertime_minutes: 0,
  unsettled_slots: unsettled,
  ...extra,
});

const results = [
  {
    employee: { id: "e2", first_name: "Ana", last_name: "Reyes" },
    entries: [
      entry("2026-10-07", ["08:00", null, null, "17:02"], ["out_am", "in_pm"]),
      entry("2026-10-08", ["08:00", "12:00", "13:00", "17:00"], []),
    ],
  },
  {
    employee: { id: "e1", first_name: "Juan", last_name: "Cruz" },
    entries: [
      entry("2026-10-07", ["07:30", "12:01", null, null], ["in_pm", "out_pm"], { undertime_minutes: 240 }),
      entry("2026-10-09", [null, null, null, null], []),
    ],
  },
];

const punches = new Map<string, ReviewPunch[]>([
  ["e1_2026-10-07", [
    { date: "2026-10-07", time: "12:01:00", device: "Building 3", status: "break out" },
    { date: "2026-10-07", time: "07:30:12", device: "Building 1", status: "check in" },
  ]],
  ["e2_2026-10-07", [{ date: "2026-10-07", time: "08:00:00", device: null, status: "" }]],
]);

test("only days with blank cells to settle are listed", () => {
  const items = buildReviewItems(results, punches);
  assert.deepEqual(items.map((i) => `${i.employeeName} ${i.date}`), [
    "Cruz, Juan 2026-10-07",
    "Reyes, Ana 2026-10-07",
  ]);
});

test("each item carries its cells, blanks, UT and punches in time order", () => {
  const [cruz] = buildReviewItems(results, punches);
  assert.deepEqual(cruz.cells, ["07:30", "12:01", null, null]);
  assert.deepEqual(cruz.unsettled, ["in_pm", "out_pm"]);
  assert.equal(cruz.utMinutes, 240);
  assert.deepEqual(cruz.punches.map((p) => `${p.time} ${p.device}`), [
    "07:30:12 Building 1",
    "12:01:00 Building 3",
  ]);
});

test("a day with no saved punches still lists, with an empty punch list", () => {
  const items = buildReviewItems(results, new Map());
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].punches, []);
});
