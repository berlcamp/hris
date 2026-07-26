// Unit tests for the pure Job Order helpers (`src/lib/job-order-helpers.ts`).
//
// These functions run on every import row and every form save, so their edge
// cases are worth pinning down here rather than discovering them in a 578-row
// production import. The legacy `jos` table stores has_atm as char(50) and
// names in inconsistent order, which is what most of these cases encode.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSortName,
  formatJoAddress,
  normalizeAreaName,
  parseJoBoolean,
} from "../../src/lib/job-order-helpers.ts";

// ── deriveSortName ──────────────────────────────────────────────────

test("already surname-first (comma) is kept in order", () => {
  assert.equal(deriveSortName("Dela Cruz, Juan P."), "dela cruz, juan p.");
});

test("first-name-first moves the last token to the front", () => {
  assert.equal(deriveSortName("Juan Dela Cruz"), "cruz juan dela");
});

test("single-token name is returned as-is", () => {
  assert.equal(deriveSortName("Madonna"), "madonna");
});

test("collapses runs of whitespace", () => {
  assert.equal(deriveSortName("Juan   Cruz"), "cruz juan");
});

test("empty name yields empty string, never throws", () => {
  assert.equal(deriveSortName("   "), "");
});

// ── formatJoAddress ─────────────────────────────────────────────────

test("joins purok and barangay with a comma", () => {
  assert.equal(formatJoAddress("Purok 3", "Poblacion"), "Purok 3, Poblacion");
});

test("omits the missing part rather than leaving a dangling comma", () => {
  assert.equal(formatJoAddress(null, "Poblacion"), "Poblacion");
  assert.equal(formatJoAddress("Purok 3", null), "Purok 3");
});

test("legacy empty-string defaults are treated as absent", () => {
  assert.equal(formatJoAddress("", ""), "");
});

// ── normalizeAreaName ───────────────────────────────────────────────

test("normalization matches the DB generated column", () => {
  assert.equal(normalizeAreaName("  Mayor's   Office "), "mayor's office");
});

// ── parseJoBoolean ──────────────────────────────────────────────────

test("accepts every has_atm spelling the legacy char column holds", () => {
  for (const yes of ["1", "Yes", "YES", "y", "true", "TRUE"]) {
    assert.equal(parseJoBoolean(yes), true, `expected true for ${yes}`);
  }
  for (const no of ["0", "No", "n", "false", "", "  "]) {
    assert.equal(parseJoBoolean(no), false, `expected false for ${no}`);
  }
});

test("unrecognized has_atm value falls back to false, never throws", () => {
  assert.equal(parseJoBoolean("maybe"), false);
});
