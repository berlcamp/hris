// Pure unit tests for the COS contract helpers. No database, no DOM.
//
// Imports are RELATIVE with a .ts extension: the Node test runner
// (`node --experimental-strip-types`) cannot resolve the "@/" path alias,
// which only Next.js's bundler understands.

import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCosContractStatus,
  toIsoDateString,
} from "../../src/lib/cos-constants.ts";

test("a terminated contract reads as terminated regardless of dates", () => {
  const result = deriveCosContractStatus(
    { status: "terminated", period_end: "2099-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "terminated");
});

test("an active contract ending in the future reads as active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("an active contract ending in the past reads as expired", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-06-30" },
    "2026-07-28",
  );
  assert.equal(result, "expired");
});

test("a contract ending exactly today is still active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-07-28" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("toIsoDateString uses local date parts, not UTC", () => {
  // 2026-07-28 23:30 local. toISOString() would roll this to the 29th in any
  // timezone east of UTC, which is exactly the class of bug migration 035 fixed.
  const d = new Date(2026, 6, 28, 23, 30, 0);
  assert.equal(toIsoDateString(d), "2026-07-28");
});
