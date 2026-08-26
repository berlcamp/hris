// Regression tests for idText.
//
// This exists because of a real production failure: `hris.employees.employee_no`
// is an `integer` in the live database despite migration 001 declaring it TEXT,
// so PostgREST returned a JSON number and a bare `.trim()` threw
// "e.id_number?.trim is not a function" in the browser, on the QR card screen.

import assert from "node:assert/strict";
import test from "node:test";
import { idText } from "../../src/lib/id-text.ts";

test("a number is coerced rather than thrown on", () => {
  assert.equal(idText(1320), "1320");
  assert.equal(idText(0), "0");
});

test("strings are trimmed", () => {
  assert.equal(idText("  CACCO-0062 "), "CACCO-0062");
  assert.equal(idText("CSWD-1576"), "CSWD-1576");
});

test("absent and blank values collapse to null, so a fallback can take over", () => {
  assert.equal(idText(null), null);
  assert.equal(idText(undefined), null);
  assert.equal(idText(""), null);
  assert.equal(idText("   "), null);
});
