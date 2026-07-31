// cmdk's default scorer matches SUBSEQUENCES: the query's letters need only
// appear in order, anywhere. Over ~1,000 employees that produced suggestions
// with no visible relationship to what was typed — "cruz" returned 18 people,
// none named Cruz, including "CAILING, ELMER". commandSubstringFilter replaces
// it with an all-terms-must-appear substring match.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { commandSubstringFilter } from "../../src/lib/command-filter.ts";
import { employeeSearchKeywords } from "../../src/lib/employee-name-match.ts";

const EMP = { first_name: "Juan", last_name: "Dela Cruz", middle_name: "Santos",
              suffix: null, biometric_no: 1234 };
const shows = (query: string, emp = EMP) =>
  commandSubstringFilter(
    `${emp.last_name} ${emp.first_name}`,
    query,
    employeeSearchKeywords(emp as Parameters<typeof employeeSearchKeywords>[0]),
  ) > 0;

test("an empty query shows everything", () => {
  assert.ok(shows(""));
  assert.ok(shows("   "));
});

test("a name matches in any order, with or without the comma", () => {
  for (const q of ["dela cruz", "juan", "dela cruz juan", "juan dela cruz",
                   "Dela Cruz, Juan", "JUAN", "  juan  "]) {
    assert.ok(shows(q), `"${q}" should match`);
  }
});

test("the middle name and biometric number are searchable", () => {
  assert.ok(shows("santos"));
  assert.ok(shows("1234"));
});

// The regression this filter exists for. Every one of these was a false
// positive under cmdk's subsequence scorer.
test("scattered letters no longer match", () => {
  assert.equal(shows("cailing"), false);
  // c-r-u-z is a subsequence of "CAILING, ELMER"+keywords but not a substring.
  assert.equal(commandSubstringFilter("Cailing Elmer", "cruz", []), 0);
  assert.equal(commandSubstringFilter("Suazo Julius Steve", "juan", []), 0);
  assert.equal(commandSubstringFilter("Jumawan Florangele", "juan", []), 0);
});

test("typing more narrows the results, never widens them", () => {
  assert.ok(shows("dela"));
  assert.ok(shows("dela cruz"));
  // A term that is not present must exclude the item even though "dela" is.
  assert.equal(shows("dela reyes"), false);
});

test("an unrelated query matches nothing", () => {
  assert.equal(shows("reyes"), false);
  assert.equal(shows("9999"), false);
});

test("punctuation and accents are normalised on both sides", () => {
  const accented = { first_name: "José", last_name: "Peña" };
  assert.ok(
    commandSubstringFilter("Peña José", "jose", employeeSearchKeywords(accented as never)) > 0,
    "an unaccented query should find an accented name",
  );
  assert.ok(
    commandSubstringFilter("Peña José", "peña", employeeSearchKeywords(accented as never)) > 0,
  );
});

test("closer matches score higher so they sort first", () => {
  const prefix = commandSubstringFilter("Dela Cruz Juan", "dela cruz", []);
  const buried = commandSubstringFilter("Vda Dela Cruz Juan", "cruz juan", []);
  assert.ok(prefix > 0 && buried > 0);
  assert.ok(prefix >= buried, "a prefix match must not rank below a buried one");
});
