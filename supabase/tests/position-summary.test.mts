// Unit tests for `src/lib/position-summary.ts`, the grouping behind the
// Position Summary report (/reports/positions).
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSalaryGradeRange,
  positionFileSlug,
  positionKey,
  summarizePositions,
  UNTITLED_POSITION,
  type PositionItem,
} from "../../src/lib/position-summary.ts";

let seq = 0;
function item(overrides: Partial<PositionItem> = {}): PositionItem {
  seq += 1;
  return {
    id: `p${seq}`,
    item_number: `ITEM-${seq}`,
    position_title: "METRO AIDE II",
    organizational_unit: null,
    salary_grade: 4,
    step: 1,
    status: "P",
    is_vacant: false,
    is_funded: true,
    actual_annual_salary: null,
    date_of_original_appointment: null,
    employees: null,
    ...overrides,
  };
}

function emp(last_name: string, first_name = "Juan") {
  return {
    id: `e-${last_name}-${first_name}`,
    id_number: null,
    first_name,
    middle_name: null,
    last_name,
    suffix: null,
    status: "active",
    employment_type: "plantilla",
    departments: null,
  };
}

test("positionKey normalizes spacing and case, and names blank titles", () => {
  assert.equal(positionKey("  metro   aide ii "), "METRO AIDE II");
  assert.equal(positionKey(""), UNTITLED_POSITION);
  assert.equal(positionKey(null), UNTITLED_POSITION);
});

test("summarizePositions groups by normalized title and counts slots", () => {
  const rows = summarizePositions([
    item({ employees: emp("Santos") }),
    item({ position_title: "Metro Aide II ", employees: emp("Reyes") }),
    item({ is_vacant: true }),
    item({ is_vacant: true, is_funded: false }),
    item({ position_title: "NURSE III", salary_grade: 17 }),
  ]);

  assert.deepEqual(
    rows.map((r) => r.title),
    ["METRO AIDE II", "NURSE III"],
  );
  const metro = rows[0];
  assert.equal(metro.total, 4);
  assert.equal(metro.filled, 2);
  assert.equal(metro.vacant, 2);
  assert.equal(metro.unfunded, 1);
  assert.deepEqual(
    metro.incumbents.map((i) => i.employees?.last_name),
    ["Reyes", "Santos"],
  );
});

test("salary grade range spans every item and skips missing grades", () => {
  const [row] = summarizePositions([
    item({ salary_grade: 11 }),
    item({ salary_grade: 13 }),
    item({ salary_grade: null }),
  ]);
  assert.equal(formatSalaryGradeRange(row), "11–13");

  const [single] = summarizePositions([item({ salary_grade: 9 })]);
  assert.equal(formatSalaryGradeRange(single), "9");

  const [none] = summarizePositions([item({ salary_grade: null })]);
  assert.equal(formatSalaryGradeRange(none), "");
});

test("positionFileSlug makes a filesystem-safe name", () => {
  assert.equal(
    positionFileSlug("ADMINISTRATIVE AIDE IV (DRIVER II)"),
    "administrative-aide-iv-driver-ii",
  );
  assert.equal(positionFileSlug("(((  )))"), "position");
});
