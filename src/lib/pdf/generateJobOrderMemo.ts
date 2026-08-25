/**
 * The Job Order MEMORANDUM printable — one document, two templates chosen by
 * the memo's type:
 *
 *   "new"    -> addressed to the City Administrator. Body: "In the exigencies
 *               of public service, you are hereby assigned to process the job
 *               order contract for the period of <period> of the person,
 *               subject to pertinent rules, laws and/or ordinances:"
 *   "retain" -> addressed to ALL PERSONS CONCERNED. Body: "Individuals whose
 *               name appear in the list below are hereby notified that their
 *               engagements as Job Orders are hereby extended until <period>
 *               under the same terms and conditions of your previous
 *               contracts:", followed by the three closing paragraphs.
 *
 * Everything else — letterhead, the No./NAMES/OFFICE ASSIGNMENT/RATE table,
 * the City Mayor signature block, the copies-furnished list and the validity
 * note — is identical between the two and is laid out here to match the
 * office's existing Word template.
 *
 * Rendered as an HTML string played through an iframe's native print, the same
 * mechanism as the Job Order payroll printables (see print-html.ts). Not
 * @react-pdf/renderer: that is used under src/components/pdf/ for forms whose
 * pixel geometry is fixed, which this is not.
 */

// Relative import WITH the .ts extension, not the `@/lib/...` alias, so
// `renderJobOrderMemo` below stays importable from
// supabase/tests/job-order-memo-render.test.mts under Node's plain ESM loader
// (it cannot resolve the alias and requires the extension).
// `allowImportingTsExtensions` in tsconfig.json makes this equally valid for
// the Next/tsc build. The type-only import is fine either way: it is erased.
import { printHTMLContent } from "./print-html.ts";
import type { JobOrderMemoType } from "@/lib/types";

// Hard-coded LGU Ozamiz City letterhead and signatories, matching the printed
// template. Overridable by env for the two that already have a project-wide
// variable; the rest can be promoted to a settings table later without
// touching this layout.
const CITY_MAYOR_NAME = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "SAM NORMAN G. FUENTES";
const CITY_MAYOR_POSITION = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "City Mayor";

/** The addressee of a "new" memo — the office that processes the contracts. */
const CITY_ADMINISTRATOR = {
  name: "MS. RUTHEZA GRACE A. OUANO",
  title: "City Administrator",
  office: "City Administrator's Office",
};

const CONTACT_LINES = [
  "TELEFAX NO. (088) 521-1390",
  "MOBILE NO. (0910) 734 2013",
  "EMAIL: ASENSOOZAMIZMAYOR@GMAIL.COM",
];

const COPIES_FURNISHED = [
  "City Human Resource Management Office",
  "City Administrator's Office",
];

export interface JobOrderMemoPrintRow {
  full_name: string;
  office_assignment: string | null;
  daily_rate: number | null;
}

export interface GenerateJobOrderMemoPrintParams {
  memoType: JobOrderMemoType;
  /** Printed as "MEMORANDUM NO. <memoNo>". */
  memoNo: string | null;
  subject: string;
  /** ISO date (yyyy-mm-dd). */
  memoDate: string;
  /** Period phrase interpolated into the body sentence, verbatim. */
  periodCovered: string | null;
  rows: JobOrderMemoPrintRow[];
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-07-22" -> "22 July 2026", the format the template uses. */
function formatMemoDate(iso: string): string {
  // `T00:00:00` keeps a date-only value on its own calendar day instead of
  // being parsed as UTC midnight and shifted back one day in PH time.
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

/** Rates print bare on the template: 480, not ₱480.00. */
function formatRate(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (Number.isInteger(n)) return Number(n).toLocaleString("en-PH");
  return Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildStyles(): string {
  return `
    @page {
      size: 8.5in 13in;
      margin: 0.35in 0.6in 0.4in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    /* The whole memo is the single cell of a one-row frame table whose <tfoot>
       carries the validity note. A table footer group is the only element
       Chrome repeats on every printed page AND reserves flow space for, so the
       note prints at the foot of page after page with nothing running under
       it. position:fixed is not an alternative here: Chrome refuses to paint a
       fixed box into the @page margin and pushes it onto the next page. */
    table.page-frame { width: 100%; border-collapse: collapse; }
    table.page-frame > tbody > tr > td,
    table.page-frame > tfoot > tr > td {
      padding: 0;
      border: none;
      vertical-align: top;
    }
    /* A column flex box one page-content tall less the footer band (a hair
       under, so a rounding error cannot spill a blank page): the
       margin-top:auto on .copies then drops the copies-furnished list to the
       foot of the page on a memo that fits on one. On a memo that runs over,
       there is no free space left to absorb and the list simply follows the
       signature on the last page. .sheet keeps every other block in normal
       flow, so the margins between them collapse exactly as they did before. */
    .frame-body {
      display: flex;
      flex-direction: column;
      min-height: 11.5in;
    }
    .header { display: flex; align-items: center; gap: 10px; }
    .header-logos { display: flex; align-items: center; gap: 8px; }
    .logo { width: 62px; height: 62px; object-fit: contain; }
    .header-center { flex: 1; text-align: center; }
    .header-title { font-size: 15pt; }
    .header-office { font-size: 15pt; font-weight: bold; color: #1d4ed8; }
    .header-city { font-size: 13pt; }
    .header-contact { font-size: 7.5pt; letter-spacing: 0.2px; }
    /* The template's red "=====" band. A double border prints as the same two
       hairlines without depending on a monospace font's glyph width. */
    .rule { border-top: 6px double #e0192b; margin: 6px 0 14px; }
    .memo-title {
      text-align: center;
      font-size: 15pt;
      font-weight: bold;
      text-decoration: underline;
      text-underline-offset: 3px;
      margin-bottom: 18px;
    }
    .fields { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .fields td { vertical-align: top; padding: 3px 0; border: none; }
    .fields .label { width: 1.25in; padding-left: 0.3in; }
    /* The template sets the whole TO/FROM/SUBJECT/DATE block in regular
       weight — only the MEMORANDUM NO. heading is bold. */
    .fields .value { font-weight: normal; }
    /* The addressee's name carries the block; his title and office sit a step
       down from it, as they do on the office's Word template. */
    .fields .addressee-sub { font-size: 10pt; font-style: italic; }
    .xrule {
      display: flex;
      align-items: center;
      gap: 2px;
      margin: 10px 0 14px;
      font-size: 11pt;
    }
    .xrule .dashes { flex: 1; border-top: 1px dashed #000; }
    .body-text { text-align: justify; text-indent: 0.5in; margin-bottom: 12px; }
    .closing { text-align: justify; margin-top: 12px; }
    .closing u { text-underline-offset: 2px; }
    table.members {
      width: 100%;
      border-collapse: collapse;
      font-size: 11pt;
      margin-top: 6px;
      /* Fixed layout + the shared <colgroup> so the continuation table under
         .tail lines its columns up with the main one instead of re-measuring
         them against its own three rows. */
      table-layout: fixed;
    }
    /* The continuation table butts against the main one; the -1px overlaps the
       two 1px borders at the seam so the join reads as a single rule. */
    table.members.continued { margin-top: -1px; }
    table.members th, table.members td {
      border: 1px solid #000;
      padding: 3px 6px;
    }
    table.members th { font-weight: normal; text-align: center; }
    table.members td.no { text-align: center; }
    table.members td.name { word-wrap: break-word; }
    table.members td.office { text-align: center; word-wrap: break-word; }
    table.members td.rate { text-align: center; }
    /* Keep a row intact across a page break and repeat the header row. */
    table.members tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    /* The closing paragraphs, the signature block, the copies-furnished list
       and the last few table rows ride together: whichever page the signature
       lands on, those rows land above it, so the mayor never signs a page that
       opens with his own name — and the copies-furnished list can never be
       stranded alone on a page of its own (Chrome ignores break-before:avoid,
       so keeping it inside this group is the only way to hold it back).
       flex:1 lets the group swallow whatever .frame-body has left over, and
       the margin-top:auto inside it spends that slack between the signature
       and the copies — which is what drops the copies, and the validity note
       under them, to the foot of a memo that fits on one page. */
    .tail {
      display: flex;
      flex-direction: column;
      flex: 1 0 auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature {
      margin-top: 0.95in;
      text-align: center;
      width: 55%;
      margin-left: auto;
      page-break-inside: avoid;
    }
    .signature-name { font-size: 13pt; }
    .copies {
      margin-top: auto;
      padding-top: 0.4in;
      font-size: 7.5pt;
      line-height: 1.25;
    }
    /* The frame table's footer group: Chrome reprints it at the foot of every
       page it spans and reserves its height in the flow, so no row ever runs
       under the note. */
    .validity {
      padding-top: 0.22in;
      text-align: center;
      font-size: 9.5pt;
      line-height: 1.3;
      page-break-inside: avoid;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `;
}

function buildLetterhead(): string {
  return `
  <div class="header">
    <div class="header-logos">
      <img src="/logo1.png" alt="" class="logo" onerror="this.style.display='none'">
      <img src="/logo2.png" alt="" class="logo" onerror="this.style.display='none'">
    </div>
    <div class="header-center">
      <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
      <div class="header-office">OFFICE OF THE CITY MAYOR</div>
      <div class="header-city">CITY OF OZAMIZ</div>
      ${CONTACT_LINES.map((l) => `<div class="header-contact">${l}</div>`).join("\n      ")}
    </div>
    <div class="header-logos">
      <img src="/logo3.png" alt="" class="logo" onerror="this.style.display='none'">
      <img src="/logo4.png" alt="" class="logo" onerror="this.style.display='none'">
    </div>
  </div>
  <div class="rule"></div>`;
}

function buildAddressee(memoType: JobOrderMemoType): string {
  if (memoType === "retain") {
    return `<div>ALL PERSONS CONCERNED</div>`;
  }
  return `
        <div>${escapeHtml(CITY_ADMINISTRATOR.name)}</div>
        <div class="addressee-sub">${escapeHtml(CITY_ADMINISTRATOR.title)}</div>
        <div class="addressee-sub">${escapeHtml(CITY_ADMINISTRATOR.office)}</div>`;
}

function buildBody(
  memoType: JobOrderMemoType,
  periodCovered: string | null,
): string {
  const period = escapeHtml(periodCovered ?? "");
  if (memoType === "retain") {
    return `
  <p class="body-text">Individuals whose name appear in the list below are hereby
  notified that their engagements as Job Orders are hereby extended until
  ${period} under the same terms and conditions of your previous contracts:</p>`;
  }
  return `
  <p class="body-text">In the exigencies of public service, you are hereby assigned
  to process the job order contract for the period of ${period} of the person,
  subject to pertinent rules, laws and/or ordinances:</p>`;
}

/** The three paragraphs that only the extension (retain) memo carries. */
function buildRetainClosing(): string {
  return `
  <p class="closing">In view of the foregoing, you are all hereby formally advised
  <u>not to report for work after the said date in the absence of a notice
  extending your engagements.</u></p>
  <p class="closing">All Department Heads are mandated to strictly implement this order.</p>
  <p class="closing">For guidance of everyone concerned.</p>`;
}

/**
 * How many trailing rows are pulled out of the main table to travel inside the
 * unbreakable .tail group with the signature. Three keeps the group short
 * enough to always fit on a page while still giving the mayor's name a piece
 * of the list above it when the table breaks right before the signature.
 */
const SIGNATURE_TAIL_ROWS = 3;

/**
 * Below this the table is not split at all — the whole thing rides in .tail.
 * Splitting a four-row table would leave a one-row stub above the break, which
 * looks worse than keeping the list whole (and a list this short always fits
 * on the page with the signature anyway).
 */
const MIN_ROWS_TO_SPLIT = SIGNATURE_TAIL_ROWS + 2;

/** Shared column widths — both tables must measure their columns identically. */
const MEMBERS_COLGROUP = `
    <colgroup>
      <col style="width: 0.42in;">
      <col style="width: 44%;">
      <col>
      <col style="width: 0.8in;">
    </colgroup>`;

function buildMemberRows(
  rows: JobOrderMemoPrintRow[],
  startIndex: number,
): string {
  return rows
    .map(
      (r, i) => `
    <tr>
      <td class="no">${startIndex + i + 1}</td>
      <td class="name">${escapeHtml(r.full_name)}</td>
      <td class="office">${escapeHtml(r.office_assignment)}</td>
      <td class="rate">${formatRate(r.daily_rate)}</td>
    </tr>`,
    )
    .join("");
}

/**
 * `withHead: false` renders the continuation table that sits under the main
 * one inside .tail. It carries no header row: on the common page it would show
 * as a duplicated header mid-list, and the main table's own <thead> already
 * repeats itself on every page it spans.
 */
function buildMembersTable(
  rows: JobOrderMemoPrintRow[],
  startIndex: number,
  withHead: boolean,
): string {
  const head = withHead
    ? `
    <thead>
      <tr>
        <th>No.</th>
        <th>NAMES</th>
        <th>OFFICE ASSIGNMENT</th>
        <th>RATE</th>
      </tr>
    </thead>`
    : "";

  return `
  <table class="members${withHead ? "" : " continued"}">${MEMBERS_COLGROUP}${head}
    <tbody>${buildMemberRows(rows, startIndex)}</tbody>
  </table>`;
}

export function renderJobOrderMemo(
  params: GenerateJobOrderMemoPrintParams,
): string {
  const { memoType, memoNo, subject, memoDate, periodCovered, rows } = params;

  // Split the list so the last few rows can be kept with the signature block.
  const isSplit = rows.length >= MIN_ROWS_TO_SPLIT;
  const headRows = isSplit ? rows.slice(0, rows.length - SIGNATURE_TAIL_ROWS) : [];
  const tailRows = isSplit ? rows.slice(rows.length - SIGNATURE_TAIL_ROWS) : rows;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Memorandum ${escapeHtml(memoNo ?? "")}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  <table class="page-frame">
  <tbody><tr><td>
  <div class="frame-body">
  <div class="sheet">
  ${buildLetterhead()}

  <div class="memo-title">MEMORANDUM NO. ${escapeHtml(memoNo ?? "")}</div>

  <table class="fields">
    <tr>
      <td class="label">TO:</td>
      <td class="value">${buildAddressee(memoType)}</td>
    </tr>
    <tr>
      <td class="label">FROM:</td>
      <td class="value">${escapeHtml(CITY_MAYOR_POSITION().toUpperCase())}</td>
    </tr>
    <tr>
      <td class="label">SUBJECT:</td>
      <td class="value">${escapeHtml(subject)}</td>
    </tr>
    <tr>
      <td class="label">DATE:</td>
      <td class="value">${escapeHtml(formatMemoDate(memoDate))}</td>
    </tr>
  </table>

  <div class="xrule"><span>X</span><span class="dashes"></span><span>X</span></div>

  ${buildBody(memoType, periodCovered)}

  ${isSplit ? buildMembersTable(headRows, 0, true) : ""}

  <div class="tail">
    ${buildMembersTable(tailRows, rows.length - tailRows.length, !isSplit)}

    ${memoType === "retain" ? buildRetainClosing() : ""}

    <div class="signature">
      <div class="signature-name">${escapeHtml(CITY_MAYOR_NAME())}</div>
      <div>${escapeHtml(CITY_MAYOR_POSITION())}</div>
    </div>

    <div class="copies">
      <div>Copies furnished:</div>
      ${COPIES_FURNISHED.map((l) => `<div>${escapeHtml(l)}</div>`).join("\n      ")}
      <div style="margin-top: 6px;">All Offices Concerned</div>
    </div>
  </div>
  </div>
  </div>
  </td></tr></tbody>
  <tfoot><tr><td>
  <div class="validity">
    This document is not valid unless it bears the official seal of the City
    Mayor. Any erasure, alteration or the like herein, renders the same invalid.
  </div>
  </td></tr></tfoot>
  </table>
</body>
</html>`.trim();
}

export function generateJobOrderMemoPrint(
  params: GenerateJobOrderMemoPrintParams,
): void {
  printHTMLContent(renderJobOrderMemo(params));
}
