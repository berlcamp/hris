// Unit tests for `src/lib/parse-csv.ts`'s `parseCsvTextToRows`.
//
// This tokenizer is shared, load-bearing code: `salary-csv-import-actions.ts`,
// `leave-credits-csv-import-actions.ts` and `job-order-csv-import-actions.ts`
// all depend on it. It was rewritten to scan the whole CSV text
// character-by-character (tracking quote state across the buffer) instead of
// splitting on `\r?\n` and parsing each line independently — the old approach
// corrupted any quoted field that itself contained a newline, which is a real
// shape in the legacy `jos.csv` `remarks` column (ids 221, 223, 225, 237, 247).
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseCsvTextToRows } from "../../src/lib/parse-csv.ts";

test("plain row with no quoting", () => {
  const rows = parseCsvTextToRows("a,b,c\n1,2,3");
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("quoted field containing a comma", () => {
  const rows = parseCsvTextToRows('id,name\n1,"Dela Cruz, Juan"');
  assert.deepEqual(rows, [
    ["id", "name"],
    ["1", "Dela Cruz, Juan"],
  ]);
});

test("quoted field containing \\r\\n stays one field, one record", () => {
  const rows = parseCsvTextToRows(
    'id,remarks\n1,"DATE STARTED : 02/03/2020 - 06/30/2022\r\nRESUME: 08/01/2022"\n2,ok',
  );
  assert.deepEqual(rows, [
    ["id", "remarks"],
    ["1", "DATE STARTED : 02/03/2020 - 06/30/2022\r\nRESUME: 08/01/2022"],
    ["2", "ok"],
  ]);
});

test("quoted field containing a bare \\n", () => {
  const rows = parseCsvTextToRows('id,remarks\n1,"line one\nline two"\n2,ok');
  assert.deepEqual(rows, [
    ["id", "remarks"],
    ["1", "line one\nline two"],
    ["2", "ok"],
  ]);
});

test("escaped double-quote (RFC 4180 \"\" -> literal \")", () => {
  const rows = parseCsvTextToRows('id,name\n1,"She said ""hi"" to me"');
  assert.deepEqual(rows, [
    ["id", "name"],
    ["1", 'She said "hi" to me'],
  ]);
});

test("trailing newline at EOF does not produce a phantom row", () => {
  const rows = parseCsvTextToRows("a,b\n1,2\n");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("blank lines are skipped", () => {
  const rows = parseCsvTextToRows("a,b\n\n1,2\n   \n3,4");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("CRLF line endings throughout the file", () => {
  const rows = parseCsvTextToRows("a,b\r\n1,2\r\n3,4\r\n");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("quoted field with BOTH a comma and a newline", () => {
  const rows = parseCsvTextToRows(
    'id,remarks\n1,"resigned, then rehired\r\nsee HR file"\n2,x',
  );
  assert.deepEqual(rows, [
    ["id", "remarks"],
    ["1", "resigned, then rehired\r\nsee HR file"],
    ["2", "x"],
  ]);
});

test("real jos.csv: 577 data records, each with 26 fields", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.join(here, "..", "old_jo_data", "jos.csv");
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsvTextToRows(text);

  const [header, ...dataRows] = rows;
  assert.equal(header.length, 26, "header should have 26 columns");
  assert.equal(dataRows.length, 577, "expected exactly 577 data records");

  for (let i = 0; i < dataRows.length; i++) {
    assert.equal(
      dataRows[i].length,
      26,
      `record ${i + 1} (id ${dataRows[i][0]}) should have 26 fields, got ${dataRows[i].length}`,
    );
  }
});
