// The employee pickers are cmdk <Command> lists, and cmdk scores with
// command-score, which is ORDER-SENSITIVE. Against an item registered as
// "Dela Cruz Juan", the query "Juan Dela Cruz" scores 0 — the employee simply
// disappears from the list, which reads as "this employee cannot be selected".
// "Dela Cruz, Juan" — the exact string the picker's own trigger displays —
// scored 0 too, because the comma is not in the value.
//
// These tests run the REAL cmdk scorer over the REAL keyword list, so they
// fail if either the helper or the cmdk scoring behaviour changes.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { employeeSearchKeywords } from "../../src/lib/employee-name-match.ts";

const require = createRequire(import.meta.url);
const scorePath = require.resolve("cmdk").replace(/index\.[cm]?js$/, "command-score.js");
const scoreMod = require(scorePath);
const commandScore: (s: string, q: string, k: string[]) => number =
  scoreMod.commandScore ?? scoreMod.default ?? scoreMod;

const EMP = {
  first_name: "Juan",
  last_name: "Dela Cruz",
  middle_name: "Santos",
  suffix: null,
  biometric_no: 1234,
};

/** Exactly what the pickers render: value plus keywords. */
const matches = (query: string) =>
  commandScore(
    `${EMP.last_name} ${EMP.first_name}`,
    query,
    employeeSearchKeywords(EMP),
  ) > 0;

test("an employee is findable by either name order", () => {
  assert.ok(matches("Dela Cruz Juan"), "last-first must match");
  assert.ok(matches("Juan Dela Cruz"), "first-last must match — the regression");
});

test("an employee is findable by the comma form the trigger displays", () => {
  assert.ok(matches("Dela Cruz, Juan"));
});

test("an employee is findable by either name alone, case-insensitively", () => {
  assert.ok(matches("Dela Cruz"));
  assert.ok(matches("Juan"));
  assert.ok(matches("juan"));
  assert.ok(matches("dela cruz"));
});

test("an employee is findable by biometric number", () => {
  assert.ok(matches("1234"));
});

test("an unrelated query still matches nothing", () => {
  assert.equal(matches("Reyes"), false);
  assert.equal(matches("9999"), false);
});

test("keywords hold no blanks for an employee with no middle name or suffix", () => {
  const keywords = employeeSearchKeywords({
    first_name: "Ana",
    last_name: "Cruz",
  });
  assert.ok(keywords.every((k) => k.trim().length > 0), "no empty keywords");
  assert.ok(keywords.includes("Ana Cruz"));
  assert.ok(keywords.includes("Cruz, Ana"));
});

// The database disagrees with the hand-written types: employees.employee_no and
// biometric_no are NUMERIC columns, and EmployeeWithRelations does not declare
// employee_no at all — so a `select("*")` row hands over a number where
// TypeScript sees an absent optional property. cmdk calls .trim() on every
// keyword, so letting one through crashed the dropdown the moment it opened
// with "m.trim is not a function". Every keyword must therefore be a string.
test("every keyword is a string even when the row carries numeric columns", () => {
  const keywords = employeeSearchKeywords({
    first_name: "Juan",
    last_name: "Dela Cruz",
    middle_name: null,
    suffix: null,
    biometric_no: 1234,
    id_number: 5678,
    employee_no: 91011,
  } as Parameters<typeof employeeSearchKeywords>[0]);

  for (const k of keywords) {
    assert.equal(typeof k, "string", `keyword ${String(k)} must be a string`);
    // This is the exact call cmdk makes; it must not throw.
    assert.doesNotThrow(() => (k as string).trim());
  }
  assert.ok(keywords.includes("91011"), "a numeric employee_no is still searchable");
  assert.ok(keywords.includes("5678"));
  assert.ok(keywords.includes("1234"));
});

test("a numeric employee_no is findable through the real cmdk scorer", () => {
  const emp = { first_name: "Juan", last_name: "Dela Cruz", employee_no: 91011 };
  const score = commandScore(
    `${emp.last_name} ${emp.first_name}`,
    "91011",
    employeeSearchKeywords(emp as Parameters<typeof employeeSearchKeywords>[0]),
  );
  assert.ok(score > 0);
});
