// The Dahua parser keeps the device's seconds. The punch pool (migration 091)
// dedupes on the exact time to the second, and a device "burst"
// (07:54:34 / 07:54:37 / 07:54:40) is only distinguishable from separate
// scans with them.

import assert from "node:assert/strict";
import test from "node:test";
import { parseDahuaFile } from "../../src/lib/dahua-parse.ts";

test("CSV export keeps seconds", () => {
  const rows = parseDahuaFile(
    "No.,No.(employee),Name,Recorded Time,Status\n1,12,Juan Cruz,2026-10-01 07:54:37,Check In",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-10-01");
  assert.equal(rows[0].time, "07:54:37");
  assert.equal(rows[0].status, "check in");
});

test("a time without seconds is padded to :00", () => {
  const rows = parseDahuaFile(
    "No.,No.(employee),Name,Recorded Time,Status\n1,12,Juan Cruz,2026/10/01 17:02,Check Out",
  );
  assert.equal(rows[0].date, "2026-10-01");
  assert.equal(rows[0].time, "17:02:00");
});

test("SpreadsheetML export keeps seconds", () => {
  const cell = (v: string) => `<Cell><Data ss:Type="String">${v}</Data></Cell>`;
  const row = (vals: string[]) => `<Row>${vals.map(cell).join("")}</Row>`;
  const xml = `<?xml version="1.0"?><Workbook><Worksheet><Table>${row(["Attendance"])}${row([
    "No.", "No.(employee)", "Name", "Recorded Time", "Recognition Mode", "Status", "Attendance Status",
  ])}${row(["1", "12", "Juan Cruz", "2026-10-01 12:01:05", "Face", "Normal", "Break Out"])}</Table></Worksheet></Workbook>`;
  const rows = parseDahuaFile(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time, "12:01:05");
  assert.equal(rows[0].status, "break out");
});
