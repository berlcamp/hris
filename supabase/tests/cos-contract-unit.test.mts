// Pure unit tests for the COS contract helpers. No database, no DOM.
//
// Imports are RELATIVE with a .ts extension: the Node test runner
// (`node --experimental-strip-types`) cannot resolve the "@/" path alias,
// which only Next.js's bundler understands.

import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCosContractStatus,
  toIsoDateString,
} from "../../src/lib/cos-constants.ts";
import { formatAmountInWords } from "../../src/lib/cos-number-to-words.ts";
import {
  resolveMergeFields,
  type MergeContext,
} from "../../src/lib/cos-merge-fields.ts";
import {
  contractDocToBlocks,
  EMPTY_CONTRACT_DOC,
  type TiptapNode,
} from "../../src/lib/cos-contract-doc.ts";

test("a terminated contract reads as terminated regardless of dates", () => {
  const result = deriveCosContractStatus(
    { status: "terminated", period_end: "2099-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "terminated");
});

test("an active contract ending in the future reads as active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("an active contract ending in the past reads as expired", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-06-30" },
    "2026-07-28",
  );
  assert.equal(result, "expired");
});

test("a contract ending exactly today is still active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-07-28" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("toIsoDateString uses local date parts, not UTC", () => {
  // 2026-07-28 23:30 local. toISOString() would roll this to the 29th in any
  // timezone east of UTC, which is exactly the class of bug migration 035 fixed.
  const d = new Date(2026, 6, 28, 23, 30, 0);
  assert.equal(toIsoDateString(d), "2026-07-28");
});

test("formatAmountInWords handles the boundaries", () => {
  assert.equal(formatAmountInWords(0), "ZERO");
  assert.equal(formatAmountInWords(1), "ONE");
  assert.equal(formatAmountInWords(19), "NINETEEN");
  assert.equal(formatAmountInWords(20), "TWENTY");
  assert.equal(formatAmountInWords(21), "TWENTY ONE");
  assert.equal(formatAmountInWords(100), "ONE HUNDRED");
  assert.equal(formatAmountInWords(999), "NINE HUNDRED NINETY NINE");
  assert.equal(formatAmountInWords(1000), "ONE THOUSAND");
  assert.equal(formatAmountInWords(24000), "TWENTY FOUR THOUSAND");
  assert.equal(formatAmountInWords(1000000), "ONE MILLION");
});

test("formatAmountInWords appends centavos as a fraction", () => {
  assert.equal(formatAmountInWords(24000.5), "TWENTY FOUR THOUSAND & 50/100");
  assert.equal(formatAmountInWords(1.25), "ONE & 25/100");
});

test("formatAmountInWords returns empty for a billion and above", () => {
  // Matches the adm-v26 original, which returns "" past 999,999,999. A COS
  // monthly rate can never reach this, and silently inventing a format would
  // be worse than an obvious blank.
  assert.equal(formatAmountInWords(1_000_000_000), "");
});

const CTX: MergeContext = {
  employee: {
    first_name: "Juan",
    middle_name: "Santos",
    last_name: "Dela Cruz",
    suffix: null,
    cos_no: "COS-2026001",
    address: "Bayugan City",
    departmentName: "City Mayor's Office",
  },
  contract: {
    position_title: "Accounting Aide",
    monthly_rate: 24000,
    period_start: "2026-01-01",
    period_end: "2026-06-30",
    scope_of_work: "Bookkeeping support",
    signatory_name: "Mayor Reyes",
    signatory_position: "City Mayor",
    witness_name: "Ana Cruz",
    witness_position: "HR Officer",
  },
  today: "2026-07-28",
};

test("resolveMergeFields substitutes identity tokens", () => {
  assert.equal(
    resolveMergeFields("This agreement with {{employee_name}}.", CTX),
    "This agreement with Dela Cruz, Juan Santos.",
  );
  assert.equal(resolveMergeFields("{{cos_no}}", CTX), "COS-2026001");
  assert.equal(resolveMergeFields("{{department}}", CTX), "City Mayor's Office");
});

test("resolveMergeFields formats dates and money", () => {
  assert.equal(resolveMergeFields("{{period_start}}", CTX), "January 1, 2026");
  assert.equal(resolveMergeFields("{{period_end}}", CTX), "June 30, 2026");
  assert.equal(resolveMergeFields("{{monthly_rate}}", CTX), "PHP 24,000.00");
  assert.equal(
    resolveMergeFields("{{monthly_rate_words}}", CTX),
    "TWENTY FOUR THOUSAND",
  );
  assert.equal(resolveMergeFields("{{today}}", CTX), "July 28, 2026");
});

test("resolveMergeFields replaces every occurrence, not just the first", () => {
  assert.equal(
    resolveMergeFields("{{cos_no}} and {{cos_no}}", CTX),
    "COS-2026001 and COS-2026001",
  );
});

test("a null value renders as empty, never as the raw token", () => {
  const ctx: MergeContext = {
    ...CTX,
    contract: { ...CTX.contract, monthly_rate: null, witness_name: null },
  };
  assert.equal(resolveMergeFields("[{{monthly_rate}}]", ctx), "[]");
  assert.equal(resolveMergeFields("[{{monthly_rate_words}}]", ctx), "[]");
  assert.equal(resolveMergeFields("[{{witness_name}}]", ctx), "[]");
});

test("an unknown token renders as empty, never as the raw token", () => {
  assert.equal(resolveMergeFields("[{{not_a_field}}]", CTX), "[]");
});

test("text with no tokens is returned unchanged", () => {
  assert.equal(resolveMergeFields("Plain clause text.", CTX), "Plain clause text.");
});

test("a paragraph becomes one block with one plain run", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello." }] },
    ],
  };
  assert.deepEqual(contractDocToBlocks(doc, CTX), [
    {
      kind: "paragraph",
      marker: null,
      runs: [{ text: "Hello.", bold: false, italic: false, underline: false }],
    },
  ]);
});

test("marks become run flags", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: "both", marks: [{ type: "italic" }, { type: "underline" }] },
        ],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.deepEqual(block.runs, [
    { text: "Plain ", bold: false, italic: false, underline: false },
    { text: "bold", bold: true, italic: false, underline: false },
    { text: "both", bold: false, italic: true, underline: true },
  ]);
});

test("merge fields resolve inside runs", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hired: {{employee_name}}" }],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.equal(block.runs[0].text, "Hired: Dela Cruz, Juan Santos");
});

test("a bullet list yields one block per item with a bullet marker", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Second" }] },
            ],
          },
        ],
      },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "listItem");
  assert.equal(blocks[0].marker, "•");
  assert.equal(blocks[1].marker, "•");
  assert.equal(blocks[1].runs[0].text, "Second");
});

test("an ordered list numbers its items from one", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "A" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "B" }] },
            ],
          },
        ],
      },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks[0].marker, "1.");
  assert.equal(blocks[1].marker, "2.");
});

test("a hardBreak inside a paragraph emits an explicit newline run instead of silently concatenating adjacent text", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Position: Clerk" },
          { type: "hardBreak" },
          { type: "text", text: "Department: HR" },
        ],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.deepEqual(block.runs, [
    { text: "Position: Clerk", bold: false, italic: false, underline: false },
    { text: "\n", bold: false, italic: false, underline: false },
    { text: "Department: HR", bold: false, italic: false, underline: false },
  ]);
  // The regression this guards against: concatenating the runs' text (as a
  // naive renderer would for one line) must still show the clause boundary
  // rather than silently running the two halves together.
  const joined = block.runs.map((r) => r.text).join("");
  assert.ok(joined.includes("Clerk\nDepartment"));
  assert.ok(!joined.includes("ClerkDepartment"));
});

test("strike/code/link marks are dropped but the underlying text survives", () => {
  // The editor disables all three (see cos-rich-text-editor.tsx) because the
  // converter only recognises bold/italic/underline. This locks in that a
  // mark it doesn't recognise degrades to plain text rather than losing the
  // text itself — unlike hardBreak, losing styling never changes what a
  // signatory reads.
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "voided", marks: [{ type: "strike" }] },
          { type: "text", text: "inline", marks: [{ type: "code" }] },
          {
            type: "text",
            text: "https://example.gov.ph",
            marks: [{ type: "link" }],
          },
        ],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.deepEqual(block.runs, [
    { text: "voided", bold: false, italic: false, underline: false },
    { text: "inline", bold: false, italic: false, underline: false },
    {
      text: "https://example.gov.ph",
      bold: false,
      italic: false,
      underline: false,
    },
  ]);
});

test("an unknown node type is dropped, not thrown on", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      { type: "horizontalRule" },
      { type: "paragraph", content: [{ type: "text", text: "Survives." }] },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].runs[0].text, "Survives.");
});

test("the empty document yields no blocks", () => {
  assert.deepEqual(contractDocToBlocks(EMPTY_CONTRACT_DOC, CTX), []);
});

test("a malformed body yields no blocks instead of throwing", () => {
  assert.deepEqual(contractDocToBlocks({ type: "doc" }, CTX), []);
});
