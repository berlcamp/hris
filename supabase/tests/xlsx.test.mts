// Unit tests for `src/lib/xlsx.ts`, the zero-dependency .xlsx writer behind
// the "Export Excel" buttons on the COS and Job Order employee lists.
//
// A malformed byte anywhere makes Excel reject the whole workbook with a
// useless "unreadable content" dialog, so the ZIP framing and the sheet XML are
// both asserted here rather than eyeballed.
//
// Entries are STORED (never deflated), so the raw archive bytes contain each
// part's XML verbatim — that is what lets these tests read the payload without
// a ZIP library.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildXlsx,
  columnLetter,
  crc32,
  sanitizeSheetName,
} from "../../src/lib/xlsx.ts";

interface Row {
  name: string;
  rate: number | null;
}

function archiveText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

/** Reads a stored (method 0) ZIP entry back out by name. */
function readEntry(bytes: Uint8Array, name: string): string {
  const buf = Buffer.from(bytes);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const size = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const entryName = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (entryName === name) {
      return buf.toString("utf8", dataStart, dataStart + size);
    }
    offset = dataStart + size;
  }
  throw new Error(`entry not found: ${name}`);
}

test("crc32 matches the reference check value", () => {
  // The IEEE 802.3 check value for "123456789".
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("columnLetter walks past Z into two-letter columns", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(27), "AB");
  assert.equal(columnLetter(51), "AZ");
  assert.equal(columnLetter(52), "BA");
});

test("sanitizeSheetName strips Excel-illegal characters and caps at 31", () => {
  assert.equal(sanitizeSheetName("COS Employees"), "COS Employees");
  assert.equal(sanitizeSheetName("A/B:C*D?E[F]G"), "A B C D E F G");
  assert.equal(sanitizeSheetName("x".repeat(40)).length, 31);
  assert.equal(sanitizeSheetName("   "), "Sheet1");
});

test("the package contains every part Excel requires", () => {
  const bytes = buildXlsx<Row>({
    sheetName: "Sheet1",
    columns: [{ header: "Name", value: (r) => r.name }],
    rows: [{ name: "Dela Cruz, Juan", rate: 1 }],
  });
  const text = archiveText(bytes);
  for (const part of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    assert.ok(text.includes(part), `missing part: ${part}`);
  }
});

test("the ZIP framing is self-consistent", () => {
  const bytes = buildXlsx<Row>({
    sheetName: "Sheet1",
    columns: [{ header: "Name", value: (r) => r.name }],
    rows: [{ name: "A", rate: 1 }],
  });
  const buf = Buffer.from(bytes);

  // End-of-central-directory sits in the last 22 bytes (no archive comment).
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  const entryCount = buf.readUInt16LE(eocd + 10);
  assert.equal(entryCount, 6);

  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  assert.equal(cdOffset + cdSize, eocd, "central directory must end at the EOCD");
  assert.equal(buf.readUInt32LE(cdOffset), 0x02014b50);

  // Every central-directory record must point at a real local header whose
  // stored CRC matches the bytes actually written.
  let cursor = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    assert.equal(buf.readUInt32LE(cursor), 0x02014b50);
    const crc = buf.readUInt32LE(cursor + 16);
    const size = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const localOffset = buf.readUInt32LE(cursor + 42);

    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50);
    assert.equal(buf.readUInt16LE(localOffset + 8), 0, "must be stored, not deflated");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLen;
    assert.equal(
      crc32(bytes.subarray(dataStart, dataStart + size)),
      crc,
      "stored CRC must match the entry payload",
    );

    cursor += 46 + nameLen;
  }
  assert.equal(cursor, eocd);
});

test("numbers stay numeric and text goes to inline strings", () => {
  const bytes = buildXlsx<Row>({
    sheetName: "Sheet1",
    columns: [
      { header: "Name", value: (r) => r.name },
      { header: "Rate", value: (r) => r.rate },
    ],
    rows: [
      { name: "Dela Cruz, Juan", rate: 12345.5 },
      { name: "Reyes, Ana", rate: null },
    ],
  });
  const sheet = readEntry(bytes, "xl/worksheets/sheet1.xml");

  // Header row is bold (style 1) and the data starts on row 2.
  assert.ok(sheet.includes(`<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>`));
  assert.ok(sheet.includes(`<c r="A2" t="inlineStr"><is><t xml:space="preserve">Dela Cruz, Juan</t></is></c>`));
  assert.ok(sheet.includes(`<c r="B2"><v>12345.5</v></c>`), "rate must be a numeric cell");
  assert.ok(sheet.includes(`<c r="B3"/>`), "null must be an empty cell, not the text 'null'");
  assert.ok(sheet.includes(`<dimension ref="A1:B3"/>`));
  assert.ok(sheet.includes(`<autoFilter ref="A1:B3"/>`));
  assert.ok(sheet.includes(`state="frozen"`), "the header row should stay frozen");
});

test("XML-hostile text is escaped, not emitted raw", () => {
  const bytes = buildXlsx<{ v: string }>({
    sheetName: "Sheet1",
    columns: [{ header: "Value", value: (r) => r.v }],
    rows: [{ v: `Legal & Admin <Office> "Main" 'x'` }],
  });
  const sheet = readEntry(bytes, "xl/worksheets/sheet1.xml");
  assert.ok(
    sheet.includes(
      `Legal &amp; Admin &lt;Office&gt; &quot;Main&quot; &apos;x&apos;`,
    ),
  );
});

test("control characters that would corrupt the workbook are dropped", () => {
  const BEL = String.fromCharCode(0x07);
  const VT = String.fromCharCode(0x0b);
  const bytes = buildXlsx<{ v: string }>({
    sheetName: "Sheet1",
    columns: [{ header: "Value", value: (r) => r.v }],
    // BEL and VT are illegal in XML 1.0; the newline is legal and stays.
    rows: [{ v: `a${BEL}b${VT}c\nd` }],
  });
  const sheet = readEntry(bytes, "xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes("abc\nd"));
  assert.ok(!sheet.includes(BEL));
  assert.ok(!sheet.includes(VT));
});

test("a filtered-to-empty table still produces a valid header-only workbook", () => {
  const bytes = buildXlsx<Row>({
    sheetName: "Sheet1",
    columns: [{ header: "Name", value: (r) => r.name }],
    rows: [],
  });
  const sheet = readEntry(bytes, "xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes(`<dimension ref="A1:A1"/>`));
  assert.ok(sheet.includes(">Name</t>"));
});

test("the workbook is deterministic for the same input", () => {
  const build = () =>
    buildXlsx<Row>({
      sheetName: "COS Employees",
      columns: [{ header: "Name", value: (r) => r.name }],
      rows: [{ name: "A", rate: 1 }],
    });
  assert.deepEqual(Buffer.from(build()), Buffer.from(build()));
});
