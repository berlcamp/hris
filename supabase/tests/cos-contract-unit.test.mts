// Pure unit tests for the COS contract helpers. No database, no DOM.
//
// Imports are RELATIVE with a .ts extension: the Node test runner
// (`node --experimental-strip-types`) cannot resolve the "@/" path alias,
// which only Next.js's bundler understands.
//
// The PDF render smoke tests near the bottom of this file DO pull in React
// and @react-pdf/renderer — that stays consistent with "no DOM" (react-pdf's
// renderToBuffer runs entirely server-side on pdfkit, no browser/jsdom
// involved) but is real rendering, not a plain data assertion: it is the
// only way to actually catch a font-resolution throw like C1, which a
// contractDocToBlocks()-only test cannot see. Built with React.createElement
// rather than JSX because `node --experimental-strip-types` strips TypeScript
// syntax only — it does not transform JSX, so this file cannot use it.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
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
  runTextStyle,
  EMPTY_CONTRACT_DOC,
  type ContractRun,
  type TiptapNode,
} from "../../src/lib/cos-contract-doc.ts";
import { toChains } from "../../src/lib/cos-contract-chains.ts";
import type { CosContractWithEmployee } from "../../src/lib/actions/cos-contract-actions.ts";

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

test("a prototype-chain token renders as empty, not the inherited property", () => {
  // Regression for a prototype-pollution bug: `values[token] ?? ""` read
  // through Object.prototype, so "{{constructor}}" resolved to
  // Object.prototype.constructor (rendering "function Object() { [native
  // code] }") and "{{__proto__}}" resolved to Object.prototype itself
  // (rendering "[object Object]") — both into a printed legal document. Both
  // tokens match the [a-z_]+ token pattern (mixed-case prototype members like
  // hasOwnProperty/toString/isPrototypeOf don't — the pattern is lowercase
  // only — so they were never reachable and aren't tested here). The fix
  // uses Object.hasOwn so only buildValues' own keys resolve; anything else,
  // including these, falls through to the empty-string default like any
  // other unknown token.
  assert.equal(resolveMergeFields("[{{constructor}}]", CTX), "[]");
  assert.equal(resolveMergeFields("[{{__proto__}}]", CTX), "[]");
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

test("the empty document yields one empty paragraph block", () => {
  // EMPTY_CONTRACT_DOC is { type: "doc", content: [{ type: "paragraph" }] },
  // not { type: "doc", content: [] } — the ProseMirror `doc` node's content
  // spec is `block+` (one-or-more), so the all-empty shape fails schema
  // validation (Node.check() throws "Invalid content for node doc: <>") even
  // though Tiptap doesn't enforce it at runtime by default. The converter is
  // deliberately NOT special-cased to skip a runless paragraph: a paragraph
  // node with no children is a real, general shape (a user-authored blank
  // line for spacing produces exactly this), and dropping it here would
  // silently swallow that blank line from the print too — the file's own
  // "drop only what's unrecognised" rule stops at node type, not run count.
  assert.deepEqual(contractDocToBlocks(EMPTY_CONTRACT_DOC, CTX), [
    { kind: "paragraph", marker: null, runs: [] },
  ]);
});

test("a malformed body yields no blocks instead of throwing", () => {
  assert.deepEqual(contractDocToBlocks({ type: "doc" }, CTX), []);
});

// ── toChains (renewal-chain ordering for the profile timeline) ─────────────
// A minimal factory: toChains only ever reads `id` and `renewed_from_id`, but
// its signature is CosContractWithEmployee[] (the real production type, not a
// narrowed stand-in), so every fixture below is a fully-shaped contract with
// the same defaults, differing only in the fields each test actually varies.
function makeContract(
  id: string,
  renewedFromId: string | null,
): CosContractWithEmployee {
  return {
    id,
    cos_employee_id: "employee-1",
    period_start: "2026-01-01",
    period_end: "2026-06-30",
    monthly_rate: null,
    position_title: null,
    scope_of_work: null,
    signatory_name: null,
    signatory_position: null,
    witness_name: null,
    witness_position: null,
    body: EMPTY_CONTRACT_DOC,
    template_id: null,
    renewed_from_id: renewedFromId,
    status: "active",
    terminated_on: null,
    termination_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    cos_employees: null,
  };
}

function idsAndDepths(rows: { contract: CosContractWithEmployee; depth: number }[]) {
  return rows.map((r) => [r.contract.id, r.depth]);
}

test("toChains: a single contract with no renewals is one row at depth 0", () => {
  const a = makeContract("a", null);
  assert.deepEqual(idsAndDepths(toChains([a])), [["a", 0]]);
});

test("toChains: a three-long chain orders A,B,C at depths 0,1,2", () => {
  const a = makeContract("a", null);
  const b = makeContract("b", "a");
  const c = makeContract("c", "b");
  // Deliberately out of order in the input — toChains must walk the chain by
  // renewed_from_id, not trust input order.
  assert.deepEqual(idsAndDepths(toChains([c, a, b])), [
    ["a", 0],
    ["b", 1],
    ["c", 2],
  ]);
});

test("toChains: two independent chains each keep their own root and successor", () => {
  const rootX = makeContract("x1", null);
  const succX = makeContract("x2", "x1");
  const rootY = makeContract("y1", null);
  const succY = makeContract("y2", "y1");
  const rows = idsAndDepths(toChains([rootX, succX, rootY, succY]));
  // Both roots present at depth 0, each immediately followed by its own
  // successor at depth 1 — chains are not interleaved or cross-linked.
  assert.deepEqual(rows, [
    ["x1", 0],
    ["x2", 1],
    ["y1", 0],
    ["y2", 1],
  ]);
});

test("toChains: an orphan whose renewed_from_id is missing from the list is appended at depth 0, not dropped", () => {
  const root = makeContract("root", null);
  // "missing" is not in the input at all — a data anomaly (UNIQUE +
  // ON DELETE RESTRICT should make this impossible), but showing it rather
  // than silently dropping it is the whole point.
  const orphan = makeContract("orphan", "missing");
  const rows = idsAndDepths(toChains([root, orphan]));
  assert.deepEqual(rows, [
    ["root", 0],
    ["orphan", 0],
  ]);
});

test("toChains: a two-cycle (A renewed_from B, B renewed_from A) terminates and both land at depth 0", () => {
  const a = makeContract("a", "b");
  const b = makeContract("b", "a");
  // Neither is a root (both have a renewed_from_id), so the root-walk loop
  // never visits either — both fall through to the orphan-appending pass.
  // This is what actually prevents the infinite loop today; the test locks
  // in the outcome so a future refactor that moved cycle-breaking onto the
  // `seen` guard inside the root walk would still have to keep it terminating.
  const rows = idsAndDepths(toChains([a, b]));
  assert.deepEqual(rows, [
    ["a", 0],
    ["b", 0],
  ]);
});

test("toChains: the same contract object appearing twice in the input is a no-op, not a second row", () => {
  const a = makeContract("a", null);
  const b = makeContract("b", "a");
  // "a" duplicated — simulates a caller accidentally passing a contract twice.
  const rows = idsAndDepths(toChains([a, a, b]));
  assert.deepEqual(rows, [
    ["a", 0],
    ["b", 1],
  ]);
});

// ── PDF render smoke test (C1 regression) ───────────────────────────────────
//
// Reproduces, at the react-pdf/font level, the exact bug an HR user hit: a
// run that is both bold and italic threw "Could not resolve font for
// Times-Bold, fontWeight 400, fontStyle italic" inside pdf(...).toBlob(),
// which cos-contract-pdf-button.tsx's catch swallowed into an opaque "Could
// not generate the contract PDF" toast. contractDocToBlocks() alone cannot
// catch this class of bug — it only produces plain data, never touching
// @react-pdf/font's resolver — so this exercises a real render through
// renderToBuffer for all four mark combinations a toolbar can actually
// produce (the toolbar's Bold and Italic buttons are independent toggles,
// so a user combining both is an ordinary interaction, not an edge case).
function renderRun(run: ContractRun) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4" },
      React.createElement(Text, { style: runTextStyle(run) }, run.text || "x"),
    ),
  );
}

const MARK_COMBINATIONS: { name: string; run: ContractRun }[] = [
  { name: "plain", run: { text: "Plain text.", bold: false, italic: false, underline: false } },
  { name: "bold", run: { text: "Bold text.", bold: true, italic: false, underline: false } },
  { name: "italic", run: { text: "Italic text.", bold: false, italic: true, underline: false } },
  {
    name: "bold+italic",
    run: { text: "Bold and italic text.", bold: true, italic: true, underline: false },
  },
];

for (const { name, run } of MARK_COMBINATIONS) {
  test(`PDF render: a ${name} run produces a non-empty PDF buffer`, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(renderRun(run) as any);
    assert.ok(buffer.length > 0);
  });
}
