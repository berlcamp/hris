// Pure unit tests for the Job Order SPECIAL ORDER printable and its zod
// schema. No database, no DOM: `renderJobOrderSpecialOrder` returns the
// document as a string, and only `generateJobOrderSpecialOrderPrint` (not
// exercised here) touches `document`.
//
// What these lock down is the part of the module a reviewer cannot eyeball
// against the office's Word template every time it changes: that the heading
// says SPECIAL ORDER and not MEMORANDUM, that the printed table is the
// three-column No./NAMES/AREA ASSIGNED one (a RATE column would leak a JO's
// pay onto a document that never carried it), that the fiscal offices stay on
// the copies-furnished list, and that employee-supplied text is HTML-escaped
// before being interpolated into the document.
//
//   node --experimental-strip-types --test supabase/tests/job-order-special-order-render.test.mts

import assert from "node:assert/strict";
import test from "node:test";

import { renderJobOrderSpecialOrder } from "../../src/lib/pdf/generateJobOrderSpecialOrder.ts";
import {
  jobOrderSpecialOrderCreateSchema,
  jobOrderSpecialOrderMemberSchema,
  jobOrderSpecialOrderMetadataSchema,
} from "../../src/lib/validations/job-order-special-order-schema.ts";

const ROWS = [
  { full_name: "DURAN, RONALD S.", area_assigned: "OFFICE OF THE CITY MAYOR" },
  { full_name: "INTO, ARCHIEANN", area_assigned: "OFFICE OF THE CITY MAYOR" },
];

test("the heading, addressee and body match the office's template", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "2025-AHFO-SO-052",
    subject: "RENDITION OF ADDITIONAL TIME SERVICES",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: ROWS,
  });

  assert.match(html, /SPECIAL ORDER NO\. 2025-AHFO-SO-052/);
  // It is a special order, not a memorandum — the two are separate series.
  assert.doesNotMatch(html, /MEMORANDUM NO\./);
  assert.match(html, /MS\. RUTHEZA GRACE A\. OUANO/);
  assert.match(html, /City Administrator&#39;s Office/);
  assert.match(html, /RENDITION OF ADDITIONAL TIME SERVICES/);
  assert.match(html, /In the exigency of public service/);
  assert.match(
    html,
    /render additional time services during Saturdays and Holidays only effective JUNE 2025; thus:/,
  );
  assert.match(html, /For strict compliance\./);
  assert.match(html, /SAM NORMAN G\. FUENTES/);
});

test("the table is No. / NAMES / AREA ASSIGNED — never a rate", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: ROWS,
  });

  assert.match(html, /<th>No\.<\/th>/);
  assert.match(html, /<th>NAMES<\/th>/);
  assert.match(html, /<th>AREA ASSIGNED<\/th>/);
  // The memorandum's two extra columns must not appear on this document.
  assert.doesNotMatch(html, /<th>RATE<\/th>/);
  assert.doesNotMatch(html, /<th>OFFICE ASSIGNMENT<\/th>/);
  assert.doesNotMatch(html, /class="rate"/);
  // Three <col>s, matching the three headers. Scoped to the table rather than
  // the whole document: the stylesheet's own prose mentions <colgroup> too.
  const table = html.slice(html.indexOf('<table class="members'));
  const colgroup = /<colgroup>([\s\S]*?)<\/colgroup>/.exec(table);
  assert.ok(colgroup);
  assert.equal((colgroup[1].match(/<col[ >]/g) ?? []).length, 3);
});

test("date prints as the template's '29 May 2025', on its own calendar day", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    // A date-only value parsed as UTC midnight would print as 28 May in PH
    // time — the T00:00:00 anchor in formatDocumentDate is what prevents that.
    soDate: "2025-05-29",
    periodCovered: null,
    rows: ROWS,
  });
  assert.match(html, />29 May 2025</);
});

test("every person prints, numbered in order", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: [...ROWS, { full_name: "BABAO, LEZEL M.", area_assigned: "CITY ACCOUNTANT'S OFFICE" }],
  });

  assert.match(html, /<td class="no">1<\/td>/);
  assert.match(html, /<td class="no">3<\/td>/);
  assert.doesNotMatch(html, /<td class="no">4<\/td>/);
});

test("the fiscal offices are on the copies-furnished list", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: ROWS,
  });

  for (const office of [
    "City Budget Office",
    "City Accounting Office",
    "City Treasurer&#39;s Office",
    "City Human Resource Management Office",
  ]) {
    assert.match(html, new RegExp(office));
  }
  assert.equal((html.match(/Copies furnished:/g) ?? []).length, 1);
});

test("caller-supplied text is HTML-escaped, not interpolated raw", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: '"><script>x()</script>',
    subject: "A & B <b>bold</b>",
    soDate: "2025-05-29",
    periodCovered: "<i>period</i>",
    rows: [{ full_name: "DELA CRUZ, JUAN <script>", area_assigned: "A & B" }],
  });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /A &amp; B &lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /DELA CRUZ, JUAN &lt;script&gt;/);
});

test("a null area prints as an empty cell rather than 'null'", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: [{ full_name: "DURAN, RONALD S.", area_assigned: null }],
  });
  assert.match(html, /<td class="area"><\/td>/);
  assert.doesNotMatch(html, /null/);
});

test("schema: subject and date are required, blanks normalize to null", () => {
  const bad = jobOrderSpecialOrderMetadataSchema.safeParse({
    subject: "   ",
    so_date: "2025-05-29",
  });
  assert.equal(bad.success, false);

  const ok = jobOrderSpecialOrderMetadataSchema.safeParse({
    subject: "  RENDITION OF ADDITIONAL TIME SERVICES  ",
    so_date: "2025-05-29",
    so_no: "",
    period_covered: null,
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data!.subject, "RENDITION OF ADDITIONAL TIME SERVICES");
  assert.equal(ok.data!.so_no, null);
  assert.equal(ok.data!.period_covered, null);

  // Calendar-invalid dates are rejected here, not by Postgres.
  assert.equal(
    jobOrderSpecialOrderMetadataSchema.safeParse({
      subject: "S",
      so_date: "2025-02-30",
    }).success,
    false,
  );
});

test("schema: creating an order requires at least one person", () => {
  const base = { subject: "S", so_date: "2025-05-29" };
  assert.equal(
    jobOrderSpecialOrderCreateSchema.safeParse({ ...base, employee_ids: [] })
      .success,
    false,
  );
  assert.equal(
    jobOrderSpecialOrderCreateSchema.safeParse({
      ...base,
      employee_ids: ["3f2504e0-4f89-11d3-9a0c-0305e82c3301"],
    }).success,
    true,
  );
});

test("schema: a member row edits its area only, blanks clearing to null", () => {
  const cleared = jobOrderSpecialOrderMemberSchema.safeParse({
    area_assigned: "   ",
  });
  assert.equal(cleared.success, true);
  assert.equal(cleared.data!.area_assigned, null);

  const kept = jobOrderSpecialOrderMemberSchema.safeParse({
    area_assigned: "  OFFICE OF THE CITY MAYOR  ",
  });
  assert.equal(kept.success, true);
  assert.equal(kept.data!.area_assigned, "OFFICE OF THE CITY MAYOR");
});

// --- page geometry: what the printed sheet must guarantee -------------------
// The layout rules themselves (a per-page validity band, the copies-furnished
// list pushed down by `margin-top: auto`) only resolve in the print engine, so
// what is asserted here is the structure they depend on: the last few rows and
// the signature share one unbreakable group, and the two footer blocks are
// separate — one repeats per page, the other prints once at the end.

/** The unbreakable group: tail rows, closing line, signature, copies. */
function tailGroup(html: string): string {
  const start = html.indexOf(`<div class="tail"`);
  const end = html.indexOf("</td></tr></tbody>");
  assert.ok(start !== -1 && end > start, "expected a .tail group inside the frame");
  return html.slice(start, end);
}

const manyRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    full_name: `EMPLOYEE, NUMBER ${i + 1}`,
    area_assigned: "OFFICE OF THE CITY MAYOR",
  }));

test("a long list keeps its last three rows in the same group as the signature", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: manyRows(10),
  });

  const tail = tailGroup(html);
  // Rows 8, 9, 10 travel with the signature; 7 stays in the main table.
  assert.match(tail, /<td class="no">8<\/td>/);
  assert.match(tail, /<td class="no">10<\/td>/);
  assert.doesNotMatch(tail, /<td class="no">7<\/td>/);
  assert.match(tail, /SAM NORMAN G\. FUENTES/);
  // The continuation table repeats no header row — the main table's own
  // <thead> is what re-prints on each page it spans.
  assert.match(tail, /class="members continued"/);
  assert.doesNotMatch(tail, /<th>NAMES<\/th>/);
  // Numbering runs 1..10 once each, across both tables.
  for (let i = 1; i <= 10; i++) {
    const hits = html.match(new RegExp(`<td class="no">${i}</td>`, "g")) ?? [];
    assert.equal(hits.length, 1, `row ${i} printed ${hits.length} times`);
  }
});

test("a short list is not split — the whole table rides with the signature", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: manyRows(3),
  });

  const tail = tailGroup(html);
  assert.match(tail, /<th>NAMES<\/th>/);
  assert.match(tail, /<td class="no">1<\/td>/);
  assert.doesNotMatch(html, /class="members continued"/);
  // Exactly one table in the document.
  assert.equal((html.match(/<table class="members/g) ?? []).length, 1);
});

test("copies furnished prints once, above the per-page validity note", () => {
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: manyRows(8),
  });

  const copies = html.indexOf('<div class="copies">');
  const validity = html.indexOf('<div class="validity">');
  assert.ok(copies !== -1 && validity > copies);
  const signature = html.indexOf('<div class="signature">');
  assert.ok(signature !== -1 && copies > signature);
  // The note lives in the frame table's <tfoot>: that is what makes the print
  // engine reprint it at the foot of every page and reserve its height, so a
  // row can never run under it.
  assert.match(html, /<tfoot><tr><td>\s*<div class="validity">/);
  assert.match(html, /<\/table>\s*<\/body>/);
  // Copies furnished rides inside the unbreakable group, never on its own page.
  assert.match(tailGroup(html), /Copies furnished:/);
});

/** The inline height planTailHeightPt() hands the group, in points. */
function tailHeightPt(html: string): number | null {
  const m = /<div class="tail" style="height: ([\d.]+)pt;">/.exec(html);
  return m ? Number(m[1]) : null;
}

test("the copies-furnished list is dropped to the foot of its page", () => {
  // Measured against a Chrome print of this template: the body cell gets
  // 841.5pt of each page, and the group is aimed 834pt down it.
  for (const rows of [manyRows(1), manyRows(12), manyRows(30)]) {
    const html = renderJobOrderSpecialOrder({
      soNo: "2025-AHFO-SO-052",
      subject: "RENDITION OF ADDITIONAL TIME SERVICES",
      soDate: "2025-05-29",
      periodCovered: "JUNE 2025",
      rows,
    });
    const height = tailHeightPt(html);
    assert.ok(
      height !== null && height > 0 && height <= 834,
      `${rows.length} rows: expected a pinned height, got ${height}`,
    );
    // The group must still be able to hold what is in it.
    assert.ok(height > 200, `${rows.length} rows: ${height}pt is too short`);
  }
});

test("an unmeasurable layout keeps its natural height rather than guessing", () => {
  // A name wide enough to land within a hair of its column edge: the geometry
  // declines to pin, and the document renders exactly as it did before.
  const html = renderJobOrderSpecialOrder({
    soNo: "X",
    subject: "S",
    soDate: "2025-05-29",
    periodCovered: "JUNE 2025",
    rows: [{ full_name: "M".repeat(18) + "I", area_assigned: "CHRMO" }],
  });
  if (tailHeightPt(html) === null) {
    assert.match(html, /<div class="tail">/);
  }
  assert.match(html, /Copies furnished:/);
});
