// How far back a schedule change re-sorts saved punches (Phase 2).
//
// From the change's effective date, but never before the first day of the
// previous month: older months are usually finalized and printed, and a
// rotation or override set today must not silently move their cells. A change
// dated in the future has nothing to re-sort yet.

import assert from "node:assert/strict";
import test from "node:test";
import { resortWindow } from "../../src/lib/schedule-resort.ts";

const TODAY = "2026-10-25";

test("a recent effective date re-sorts from that date to today", () => {
  assert.deepEqual(resortWindow("2026-10-12", TODAY), { from: "2026-10-12", to: TODAY });
});

test("an old effective date is clamped to the start of the previous month", () => {
  assert.deepEqual(resortWindow("2026-03-01", TODAY), { from: "2026-09-01", to: TODAY });
});

test("the clamp crosses a year boundary", () => {
  assert.deepEqual(resortWindow("2025-06-01", "2026-01-15"), { from: "2025-12-01", to: "2026-01-15" });
});

test("a future effective date has nothing to re-sort", () => {
  assert.equal(resortWindow("2026-11-02", TODAY), null);
});
