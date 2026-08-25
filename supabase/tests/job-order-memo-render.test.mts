// Pure unit tests for the Job Order MEMORANDUM printable and its zod schema.
// No database, no DOM: `renderJobOrderMemo` returns the document as a string,
// and only `generateJobOrderMemoPrint` (not exercised here) touches `document`.
//
// What these lock down is the part of the module a reviewer cannot eyeball
// against the office's Word template every time it changes: that each memo
// type keeps its own addressee and its own body sentence, that the "retain"
// closing paragraphs never leak onto a "new" memo, that the typed SO No. lands
// in the heading, and that employee-supplied text is HTML-escaped before being
// interpolated into the document.
//
//   node --experimental-strip-types --test supabase/tests/job-order-memo-render.test.mts

import assert from "node:assert/strict";
import test from "node:test";

import { renderJobOrderMemo } from "../../src/lib/pdf/generateJobOrderMemo.ts";
import {
  jobOrderMemoCreateSchema,
  jobOrderMemoDuplicateSchema,
  jobOrderMemoMetadataSchema,
} from "../../src/lib/validations/job-order-memo-schema.ts";

const ROWS = [
  { full_name: "TAGACTAC, KELLA GRACE A.", office_assignment: "OFFICE OF THE CITY MAYOR", daily_rate: 480 },
  { full_name: "INTO, ARCHIEANN", office_assignment: "OFFICE OF THE CITY MAYOR", daily_rate: 480 },
];

test("new memo: addressed to the City Administrator, contract-processing body", () => {
  const html = renderJobOrderMemo({
    memoType: "new",
    memoNo: "2026-SNGF-JO-019",
    subject: "JOB ORDER CONTRACTS",
    memoDate: "2026-07-22",
    periodCovered: "July 24-31, 2026",
    rows: ROWS,
  });

  assert.match(html, /MEMORANDUM NO\. 2026-SNGF-JO-019/);
  assert.match(html, /MS\. RUTHEZA GRACE A\. OUANO/);
  assert.match(html, /City Administrator&#39;s Office/);
  assert.match(html, /In the exigencies of public service/);
  assert.match(html, /for the period of\s+July 24-31, 2026 of the person/);
  // The extension paragraphs belong to the other template only.
  assert.doesNotMatch(html, /not to report for work after the said date/);
  assert.doesNotMatch(html, /ALL PERSONS CONCERNED/);
});

test("retain memo: addressed to all persons concerned, carries the closing paragraphs", () => {
  const html = renderJobOrderMemo({
    memoType: "retain",
    memoNo: "2026-SNGF-JO-020",
    subject:
      "INDIVIDUALS ENGAGED THROUGH JOB ORDERS FOR THE PERIOD OF AUGUST 2026 - SEPTEMBER 2026",
    memoDate: "2026-07-24",
    periodCovered: "AUGUST 2026 - SEPTEMBER 2026",
    rows: ROWS,
  });

  assert.match(html, /ALL PERSONS CONCERNED/);
  assert.match(html, /hereby extended until\s+AUGUST 2026 - SEPTEMBER 2026/);
  assert.match(html, /not to report for work after the said date/);
  assert.match(html, /All Department Heads are mandated to strictly implement this order/);
  assert.doesNotMatch(html, /In the exigencies of public service/);
  assert.doesNotMatch(html, /MS\. RUTHEZA GRACE A\. OUANO/);
});

test("date prints as the template's '22 July 2026', on its own calendar day", () => {
  const html = renderJobOrderMemo({
    memoType: "new",
    memoNo: "X",
    subject: "S",
    // A date-only value parsed as UTC midnight would print as 21 July in PH
    // time — the T00:00:00 anchor in formatMemoDate is what prevents that.
    memoDate: "2026-07-22",
    periodCovered: null,
    rows: ROWS,
  });
  assert.match(html, />22 July 2026</);
});

test("every member prints, numbered in order, with a bare rate", () => {
  const html = renderJobOrderMemo({
    memoType: "retain",
    memoNo: "X",
    subject: "S",
    memoDate: "2026-07-24",
    periodCovered: "AUGUST 2026",
    rows: [...ROWS, { full_name: "BABAO, LEZEL M.", office_assignment: "CITY ACCOUNTANT'S OFFICE", daily_rate: 480 }],
  });

  assert.match(html, /<td class="no">1<\/td>/);
  assert.match(html, /<td class="no">3<\/td>/);
  assert.doesNotMatch(html, /<td class="no">4<\/td>/);
  // Bare "480", not "₱480.00" — the template prints the integer.
  assert.match(html, /<td class="rate">480<\/td>/);
});

test("caller-supplied text is HTML-escaped, not interpolated raw", () => {
  const html = renderJobOrderMemo({
    memoType: "new",
    memoNo: '"><script>x()</script>',
    subject: "A & B <b>bold</b>",
    memoDate: "2026-07-22",
    periodCovered: "<i>period</i>",
    rows: [
      { full_name: "DELA CRUZ, JUAN <script>", office_assignment: "A & B", daily_rate: null },
    ],
  });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /A &amp; B &lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /DELA CRUZ, JUAN &lt;script&gt;/);
  // A null rate prints as an empty cell rather than "null".
  assert.match(html, /<td class="rate"><\/td>/);
});

test("schema: subject and date are required, blanks normalize to null", () => {
  const bad = jobOrderMemoMetadataSchema.safeParse({
    subject: "   ",
    memo_date: "2026-07-22",
    memo_type: "new",
  });
  assert.equal(bad.success, false);

  const ok = jobOrderMemoMetadataSchema.safeParse({
    subject: "  JOB ORDER CONTRACTS  ",
    memo_date: "2026-07-22",
    memo_type: "retain",
    memo_no: "",
    period_covered: null,
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data!.subject, "JOB ORDER CONTRACTS");
  assert.equal(ok.data!.memo_no, null);
  assert.equal(ok.data!.period_covered, null);

  // Calendar-invalid dates are rejected here, not by Postgres.
  assert.equal(
    jobOrderMemoMetadataSchema.safeParse({
      subject: "S",
      memo_date: "2026-02-30",
      memo_type: "new",
    }).success,
    false,
  );
});

test("schema: duplicating asks for the heading only, never the template", () => {
  const parsed = jobOrderMemoDuplicateSchema.safeParse({
    subject: "JOB ORDER CONTRACTS",
    memo_date: "2026-08-01",
    memo_no: "2026-SNGF-JO-021",
    period_covered: "August 1-15, 2026",
    // A caller trying to switch the copy to the other template must not be
    // able to: duplicateJobOrderMemo reads memo_type off the SOURCE row.
    memo_type: "retain",
  });
  assert.equal(parsed.success, true);
  assert.equal("memo_type" in parsed.data!, false);

  // Date stays required on the copy — two memos must not share one heading by
  // accident.
  assert.equal(
    jobOrderMemoDuplicateSchema.safeParse({ subject: "S", memo_date: "" }).success,
    false,
  );
});

test("schema: creating a memo requires at least one employee", () => {
  const base = {
    subject: "S",
    memo_date: "2026-07-22",
    memo_type: "new" as const,
  };
  assert.equal(
    jobOrderMemoCreateSchema.safeParse({ ...base, employee_ids: [] }).success,
    false,
  );
  assert.equal(
    jobOrderMemoCreateSchema.safeParse({
      ...base,
      employee_ids: ["3f2504e0-4f89-11d3-9a0c-0305e82c3301"],
    }).success,
    true,
  );
});

// --- page geometry: what the printed sheet must guarantee -------------------
// The layout rules themselves (a fixed validity band, the copies-furnished
// list pushed down by `margin-top: auto`) only resolve in the print engine, so
// what is asserted here is the structure they depend on: the last few rows and
// the signature share one unbreakable group, and the two footer blocks are
// separate — one repeats per page, the other prints once at the end.

/** The unbreakable group: tail rows, closing, signature, copies furnished. */
function tailGroup(html: string): string {
  const start = html.indexOf(`<div class="tail"`);
  const end = html.indexOf("</td></tr></tbody>");
  assert.ok(start !== -1 && end > start, "expected a .tail group inside the frame");
  return html.slice(start, end);
}

const manyRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    full_name: `EMPLOYEE, NUMBER ${i + 1}`,
    office_assignment: "OFFICE OF THE CITY MAYOR",
    daily_rate: 480,
  }));

test("a long list keeps its last three rows in the same group as the signature", () => {
  const html = renderJobOrderMemo({
    memoType: "retain",
    memoNo: "X",
    subject: "S",
    memoDate: "2026-07-24",
    periodCovered: "AUGUST 2026",
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
  const html = renderJobOrderMemo({
    memoType: "new",
    memoNo: "X",
    subject: "S",
    memoDate: "2026-07-22",
    periodCovered: "July 2026",
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
  const html = renderJobOrderMemo({
    memoType: "retain",
    memoNo: "X",
    subject: "S",
    memoDate: "2026-07-24",
    periodCovered: "AUGUST 2026",
    rows: manyRows(8),
  });

  const copies = html.indexOf('<div class="copies">');
  const validity = html.indexOf('<div class="validity">');
  assert.ok(copies !== -1 && validity > copies);
  const signature = html.indexOf('<div class="signature">');
  assert.ok(signature !== -1 && copies > signature);
  assert.match(html, /Copies furnished:/);
  assert.equal((html.match(/Copies furnished:/g) ?? []).length, 1);
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
  for (const rows of [manyRows(2), manyRows(12), manyRows(30)]) {
    for (const memoType of ["new", "retain"] as const) {
      const html = renderJobOrderMemo({
        memoType,
        memoNo: "X",
        subject: "INDIVIDUALS ENGAGED THROUGH JOB ORDERS",
        memoDate: "2026-07-24",
        periodCovered: "01 August 2026 to 31 December 2026",
        rows,
      });
      const height = tailHeightPt(html);
      assert.ok(
        height !== null && height > 0 && height <= 834,
        `${memoType}/${rows.length}: expected a pinned height, got ${height}`,
      );
      // The group must still be able to hold what is in it.
      assert.ok(height > 200, `${memoType}/${rows.length}: ${height}pt is too short`);
    }
  }
});

test("an unmeasurable layout keeps its natural height rather than guessing", () => {
  // A name wide enough to land within a hair of its column edge: the geometry
  // declines to pin, and the document renders exactly as it did before.
  const html = renderJobOrderMemo({
    memoType: "new",
    memoNo: "X",
    subject: "S",
    memoDate: "2026-07-22",
    rows: [{ full_name: "M".repeat(24) + "I", office_assignment: "CHRMO", daily_rate: 480 }],
    periodCovered: "July 2026",
  });
  if (tailHeightPt(html) === null) {
    assert.match(html, /<div class="tail">/);
  }
  assert.match(html, /Copies furnished:/);
});
