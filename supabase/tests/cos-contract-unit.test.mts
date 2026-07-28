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
import { formatAmountInWords } from "../../src/lib/cos-number-to-words.ts";

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

test("formatAmountInWords handles the boundaries", () => {
  assert.equal(formatAmountInWords(0), "ZERO");
  assert.equal(formatAmountInWords(1), "ONE");
  assert.equal(formatAmountInWords(19), "NINETEEN");
  assert.equal(formatAmountInWords(20), "TWENTY");
  assert.equal(formatAmountInWords(21), "TWENTY ONE");
  assert.equal(formatAmountInWords(100), "ONE HUNDRED");
  assert.equal(formatAmountInWords(999), "NINE HUNDRED NINETY NINE");
  assert.equal(formatAmountInWords(1000), "ONE THOUSAND");
  assert.equal(formatAmountInWords(24000), "TWENTY FOUR THOUSAND");
  assert.equal(formatAmountInWords(1000000), "ONE MILLION");
});

test("formatAmountInWords appends centavos as a fraction", () => {
  assert.equal(formatAmountInWords(24000.5), "TWENTY FOUR THOUSAND & 50/100");
  assert.equal(formatAmountInWords(1.25), "ONE & 25/100");
});

test("formatAmountInWords returns empty for a billion and above", () => {
  // Matches the adm-v26 original, which returns "" past 999,999,999. A COS
  // monthly rate can never reach this, and silently inventing a format would
  // be worse than an obvious blank.
  assert.equal(formatAmountInWords(1_000_000_000), "");
});
