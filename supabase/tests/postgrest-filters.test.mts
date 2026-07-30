// Unit tests for `src/lib/postgrest-filters.ts`.
//
// This defect class has now shipped twice — once in the Job Order payroll list
// (fixed as I1 in that branch's final review) and once in the RSP applicant
// search, found by the same review and fixed later. Both times the symptom was
// a PostgREST 400 that killed the page, triggered by nothing more exotic than a
// comma in a search box: "Ozamiz, Area 1" or "Dela Cruz, Juan".
//
// PostgREST splits an `.or(...)` argument on top-level commas. Double-quoting
// each value protects the comma; escaping `\` and `"` inside the value stops it
// closing the quote early. These tests pin both halves.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIlikeOrFilter,
  escapeOrFilterValue,
} from "../../src/lib/postgrest-filters.ts";

// ── escapeOrFilterValue ─────────────────────────────────────────────

test("a plain value passes through untouched", () => {
  assert.equal(escapeOrFilterValue("%Ozamiz%"), "%Ozamiz%");
});

test("a comma is left alone — the surrounding quotes are what protect it", () => {
  assert.equal(escapeOrFilterValue("%Ozamiz, Area 1%"), "%Ozamiz, Area 1%");
});

test("a double quote is backslash-escaped so it cannot close the quote early", () => {
  assert.equal(escapeOrFilterValue('a"b'), 'a\\"b');
});

test("a backslash is doubled", () => {
  assert.equal(escapeOrFilterValue("a\\b"), "a\\\\b");
});

// Order matters: backslashes must be escaped BEFORE quotes, or the backslash
// added for the quote gets escaped a second time and the quote goes free.
test("a backslash followed by a quote escapes both, in the right order", () => {
  assert.equal(escapeOrFilterValue('a\\"b'), 'a\\\\\\"b');
});

test("an attempt to close the quote and inject a filter stays inside the value", () => {
  const escaped = escapeOrFilterValue('%",status.eq.finalized,x.ilike."%');
  // Every quote is escaped, so nothing here can terminate the quoted value.
  assert.equal(escaped.includes('\\"'), true);
  assert.equal(/(^|[^\\])"/.test(escaped), false, "no unescaped quote may survive");
});

// ── buildIlikeOrFilter ──────────────────────────────────────────────

test("builds one quoted ilike fragment per column, comma-joined", () => {
  assert.equal(
    buildIlikeOrFilter(["last_name", "first_name"], "Cruz"),
    'last_name.ilike."%Cruz%",first_name.ilike."%Cruz%"',
  );
});

test("wraps the term in % itself — callers pass bare text", () => {
  assert.equal(buildIlikeOrFilter(["areas"], "CDRRMO"), 'areas.ilike."%CDRRMO%"');
});

// The regression case. Unquoted, this produced
// `last_name.ilike.%Dela Cruz` + ` Juan%` — two fragments, the second invalid.
test("a term containing a comma stays a single fragment per column", () => {
  const filter = buildIlikeOrFilter(["last_name"], "Dela Cruz, Juan");
  assert.equal(filter, 'last_name.ilike."%Dela Cruz, Juan%"');
  // One column in, one fragment out: the comma did not split anything.
  assert.equal(filter.split('",').length, 1);
});

test("three columns and a comma still yield exactly three fragments", () => {
  const filter = buildIlikeOrFilter(
    ["description", "particulars", "areas"],
    "Ozamiz, Area 1",
  );
  assert.equal(filter.match(/\.ilike\./g)?.length, 3);
  assert.equal(
    filter,
    'description.ilike."%Ozamiz, Area 1%",particulars.ilike."%Ozamiz, Area 1%",areas.ilike."%Ozamiz, Area 1%"',
  );
});

test("an empty column list yields an empty string", () => {
  assert.equal(buildIlikeOrFilter([], "Cruz"), "");
});
