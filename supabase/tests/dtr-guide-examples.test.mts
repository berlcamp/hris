// The DTR guide's example table is computed from the real sorting and charging
// rules, so it cannot drift from what the DTR prints. These assertions pin the
// rows the HR office signed off on (Oct 2026).

import assert from "node:assert/strict";
import test from "node:test";
import { buildGuideRows } from "../../src/lib/dtr-guide-examples.ts";

const rows = buildGuideRows();
const row = (id: string) => {
  const r = rows.find((x) => x.id === id);
  assert.ok(r, `missing guide row ${id}`);
  return r;
};

test("arrival re-scans collapse to the earliest; a blank afternoon is 4:00", () => {
  const r = row("rescans");
  assert.deepEqual(r.cells, ["7:30 AM", "12:01 PM", null, null]);
  assert.equal(r.ut, "4:00");
  assert.deepEqual(r.unsettled, ["in_pm", "out_pm"]);
});

test("in and out with no lunch punches costs nothing and is unsettled", () => {
  const r = row("no-lunch");
  assert.deepEqual(r.cells, ["8:00 AM", null, null, "5:02 PM"]);
  assert.equal(r.ut, "0:00");
  assert.deepEqual(r.unsettled, ["out_am", "in_pm"]);
});

test("a re-scan after lunch is not the PM out", () => {
  const r = row("pm-rescan");
  assert.deepEqual(r.cells, ["7:58 AM", "12:01 PM", "12:58 PM", null]);
  assert.equal(r.ut, "0:00");
});

test("a complete late day is measured to the minute", () => {
  const r = row("late-day");
  assert.equal(r.ut, "0:35");
  assert.deepEqual(r.unsettled, []);
});

test("a night shift's clock-out is marked as the next day", () => {
  const r = row("night");
  assert.deepEqual(r.cells, ["9:56 PM", null, null, "6:03 AM (+1)"]);
  assert.equal(r.ut, "0:00");
});

test("every row carries punches and an explanation", () => {
  assert.ok(rows.length >= 10);
  for (const r of rows) {
    assert.ok(r.punches.length > 0, r.id);
    assert.ok(r.note.length > 0, r.id);
  }
});
