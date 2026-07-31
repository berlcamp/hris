// Unit tests for the correction request zod schema. These are the only thing
// between the wizard and a raw Postgres constraint violation, so what they
// REJECT matters as much as what they accept.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { correctionRequestSchema } from "../../src/lib/validations/attendance-correction-schema.ts";

const EMP = "123e4567-e89b-12d3-a456-426614174000";
const LOG = "123e4567-e89b-12d3-a456-426614174001";

const validItem = {
  duty_date: "2026-06-15",
  attendance_log_id: LOG,
  disposition: "update" as const,
  proposed_schedule_id: null,
  time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
  reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
};

const valid = {
  employee_id: EMP,
  date_from: "2026-06-15",
  date_to: "2026-06-20",
  reason: "Night rotation per Office Order 2026-114",
  items: [validItem],
};

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  assert.equal(result.success, false, "expected this input to be rejected");
  return result.error!.issues[0]!.message;
}

test("a well-formed request is accepted", () => {
  assert.equal(correctionRequestSchema.safeParse(valid).success, true);
});

test("date_to must not precede date_from", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, date_from: "2026-06-20", date_to: "2026-06-15" });
  assert.match(firstError(r), /end date/i);
});

test("a calendar-invalid date is rejected", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, date_from: "2026-02-30", date_to: "2026-02-30" });
  assert.equal(r.success, false);
});

// holiday is HR's alone — hris.holidays is org-wide.
test("holiday is not a reason a requester may choose", () => {
  const r = correctionRequestSchema.safeParse({
    ...valid,
    items: [{ ...validItem, reason_in_am: "holiday" }],
  });
  assert.equal(r.success, false);
});

test("a request with no items is rejected", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, items: [] });
  assert.match(firstError(r), /at least one day/i);
});

test("a narrative reason is required", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, reason: "  " });
  assert.match(firstError(r), /reason/i);
});

test("a malformed time is rejected rather than coerced", () => {
  const r = correctionRequestSchema.safeParse({
    ...valid,
    items: [{ ...validItem, time_in_am: "9am" }],
  });
  assert.equal(r.success, false);
});
