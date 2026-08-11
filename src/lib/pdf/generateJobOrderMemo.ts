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
    }
    table.members th, table.members td {
      border: 1px solid #000;
      padding: 3px 6px;
    }
    table.members th { font-weight: normal; text-align: center; }
    table.members td.no { text-align: center; width: 0.42in; }
    table.members td.office { text-align: center; }
    table.members td.rate { text-align: center; width: 0.8in; }
    /* Keep a row intact across a page break and repeat the header row. */
    table.members tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .signature {
      margin-top: 60px;
      text-align: center;
      width: 55%;
      margin-left: auto;
      page-break-inside: avoid;
    }
    .signature-name { font-size: 13pt; }
    .footer { margin-top: 90px; font-size: 7.5pt; line-height: 1.25; }
    .validity {
      margin-top: 24px;
      text-align: center;
      font-size: 9.5pt;
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
        <div>${escapeHtml(CITY_ADMINISTRATOR.title)}</div>
        <div>${escapeHtml(CITY_ADMINISTRATOR.office)}</div>`;
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

function buildMembersTable(rows: JobOrderMemoPrintRow[]): string {
  const body = rows
    .map(
      (r, i) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td>${escapeHtml(r.full_name)}</td>
      <td class="office">${escapeHtml(r.office_assignment)}</td>
      <td class="rate">${formatRate(r.daily_rate)}</td>
    </tr>`,
    )
    .join("");

  return `
  <table class="members">
    <thead>
      <tr>
        <th style="width: 0.42in;">No.</th>
        <th>NAMES</th>
        <th>OFFICE ASSIGNMENT</th>
        <th style="width: 0.8in;">RATE</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

export function renderJobOrderMemo(
  params: GenerateJobOrderMemoPrintParams,
): string {
  const { memoType, memoNo, subject, memoDate, periodCovered, rows } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Memorandum ${escapeHtml(memoNo ?? "")}</title>
  <style>${buildStyles()}</style>
</head>
<body>
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

  ${buildMembersTable(rows)}

  ${memoType === "retain" ? buildRetainClosing() : ""}

  <div class="signature">
    <div class="signature-name">${escapeHtml(CITY_MAYOR_NAME())}</div>
    <div>${escapeHtml(CITY_MAYOR_POSITION())}</div>
  </div>

  <div class="footer">
    <div>Copies furnished:</div>
    ${COPIES_FURNISHED.map((l) => `<div>${escapeHtml(l)}</div>`).join("\n    ")}
    <div style="margin-top: 6px;">All Offices Concerned</div>
  </div>

  <div class="validity">
    This document is not valid unless it bears the official seal of the City
    Mayor. Any erasure, alteration or the like herein, renders the same invalid.
  </div>
</body>
</html>`.trim();
}

export function generateJobOrderMemoPrint(
  params: GenerateJobOrderMemoPrintParams,
): void {
  printHTMLContent(renderJobOrderMemo(params));
}
