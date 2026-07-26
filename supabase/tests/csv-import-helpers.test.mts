// Unit tests for `parseFlexibleCsvDate` in `src/lib/csv-import-helpers.ts`.
//
// This was broadened from accepting only YYYY-MM-DD / MM/DD/YYYY to also
// accept D-Mon-YY(YY), "Month D,YYYY", MM-DD-YYYY, and MM/DD/YY / MM-DD-YY —
// all confirmed present in the real legacy `jos.csv`. Both
// `salary-csv-import-actions.ts` and the JO importer call this function, so
// every pre-existing accepted string must still parse exactly as before.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { parseFlexibleCsvDate } from "../../src/lib/csv-import-helpers.ts";

// ── pre-existing formats (must not regress) ─────────────────────────────

test("YYYY-MM-DD passes through unchanged", () => {
  assert.equal(parseFlexibleCsvDate("2023-06-20"), "2023-06-20");
});

test("MM/DD/YYYY reads as US month/day (05/01/2019 -> May 1)", () => {
  assert.equal(parseFlexibleCsvDate("05/01/2019"), "2019-05-01");
});

// ── newly added formats ──────────────────────────────────────────────────

test("D-Mon-YY (2-digit year)", () => {
  assert.equal(parseFlexibleCsvDate("1-Jul-22"), "2022-07-01");
});

test("D-Mon-YYYY (4-digit year)", () => {
  assert.equal(parseFlexibleCsvDate("1-Jul-2022"), "2022-07-01");
});

test("D-Mon-YY is case-insensitive on the month abbreviation", () => {
  assert.equal(parseFlexibleCsvDate("15-JAN-24"), "2024-01-15");
  assert.equal(parseFlexibleCsvDate("15-jan-24"), "2024-01-15");
});

test('"Month D,YYYY" with no space after the comma', () => {
  assert.equal(parseFlexibleCsvDate("June 29,2023"), "2023-06-29");
});

test('"Month D, YYYY" with a space after the comma, all-caps month', () => {
  assert.equal(parseFlexibleCsvDate("JULY 1,2023"), "2023-07-01");
});

test("MM-DD-YYYY (dash separator, 4-digit year)", () => {
  assert.equal(parseFlexibleCsvDate("07-31-2023"), "2023-07-31");
});

test("MM/DD/YY (slash separator, 2-digit year)", () => {
  assert.equal(parseFlexibleCsvDate("04/06/26"), "2026-04-06");
});

test("MM-DD-YY (dash separator, 2-digit year)", () => {
  assert.equal(parseFlexibleCsvDate("10-25-23"), "2023-10-25");
});

// ── two-digit year pivot ─────────────────────────────────────────────────

test("two-digit year pivot: 69 -> 2069", () => {
  assert.equal(parseFlexibleCsvDate("01/01/69"), "2069-01-01");
});

test("two-digit year pivot: 70 -> 1970", () => {
  assert.equal(parseFlexibleCsvDate("01/01/70"), "1970-01-01");
});

// ── must remain null: real data-entry errors from jos.csv ───────────────

test("bare month name with no day/year is rejected", () => {
  assert.equal(parseFlexibleCsvDate("JULY"), null);
});

test("a bare number is rejected", () => {
  assert.equal(parseFlexibleCsvDate("410"), null);
});

test("3-digit year is rejected, not coerced", () => {
  assert.equal(parseFlexibleCsvDate("02/02/026"), null);
});

test("mismatched separators (slash then period) are rejected", () => {
  assert.equal(parseFlexibleCsvDate("05/04.2026"), null);
});

test("doubled separator is rejected", () => {
  assert.equal(parseFlexibleCsvDate("06/03//2026"), null);
});

// ── existing validity checks ─────────────────────────────────────────────

test("invalid calendar date (Feb 30) is rejected", () => {
  assert.equal(parseFlexibleCsvDate("02/30/2023"), null);
});

test("blank input returns null", () => {
  assert.equal(parseFlexibleCsvDate(""), null);
  assert.equal(parseFlexibleCsvDate("   "), null);
});
