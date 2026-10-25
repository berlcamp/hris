// The warning a DTR screen shows before printing when some days still have
// blank punches to settle (the unsettled rule, migration 092).

import assert from "node:assert/strict";
import test from "node:test";
import { unsettledNotice } from "../../src/lib/dtr-unsettled.ts";

const emp = (first: string, last: string) => ({ first_name: first, last_name: last });
const day = (date: string, slots: string[] = []) => ({ date, unsettled_slots: slots });

test("nothing unsettled, no notice", () => {
  assert.equal(
    unsettledNotice([{ employee: emp("Juan", "Cruz"), entries: [day("2026-10-01"), day("2026-10-02")] }]),
    null,
  );
});

test("one employee lists the dates", () => {
  assert.equal(
    unsettledNotice([
      {
        employee: emp("Juan", "Cruz"),
        entries: [day("2026-10-01", ["out_am", "in_pm"]), day("2026-10-02"), day("2026-10-09", ["out_pm"])],
      },
    ]),
    "Cruz, Juan has 2 days with blank punches to settle: Oct 1, Oct 9.",
  );
});

test("several employees are summarised", () => {
  assert.equal(
    unsettledNotice([
      { employee: emp("Juan", "Cruz"), entries: [day("2026-10-01", ["out_pm"])] },
      { employee: emp("Ana", "Reyes"), entries: [day("2026-10-02", ["in_am"]), day("2026-10-03", ["out_pm"])] },
      { employee: emp("Ben", "Lim"), entries: [day("2026-10-02")] },
    ]),
    "3 days across 2 employees have blank punches to settle.",
  );
});

test("a single unsettled day is singular", () => {
  assert.equal(
    unsettledNotice([{ employee: emp("Juan", "Cruz"), entries: [day("2026-10-01", ["out_pm"])] }]),
    "Cruz, Juan has 1 day with blank punches to settle: Oct 1.",
  );
});
