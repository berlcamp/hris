/**
 * The Job Order SPECIAL ORDER printable, laid out to match the office's Word
 * template (see the "SPECIAL ORDER NO. 2025-AHFO-SO-052" reference copy):
 *
 *   SPECIAL ORDER NO. <so_no>
 *   TO:      MS. RUTHEZA GRACE A. OUANO / City Administrator
 *   FROM:    CITY MAYOR
 *   SUBJECT: <subject>
 *   DATE:    <so_date>
 *   X-----------------------------------------------------------------X
 *   "In the exigency of public service and the importance / necessity of
 *    timely access and delivery of public services the ensuing named personnel
 *    are directed to render additional time services during Saturdays and
 *    Holidays only effective <period>; thus:"
 *   [ No. | NAMES | AREA ASSIGNED ]
 *   "For strict compliance."
 *
 * Sibling of generateJobOrderMemo.ts, from which the page-fitting machinery
 * comes. Three things differ from the memorandum and are why this is its own
 * file rather than a third `memoType`:
 *
 *   * one template, not two — no addressee or body switch;
 *   * a THREE-column table (no RATE), so the columns and row heights differ;
 *   * its own closing line and its own copies-furnished list.
 *
 * Rendered as an HTML string played through an iframe's native print, the same
 * mechanism as the memorandum and the Job Order payroll printables (see
 * print-html.ts). Not @react-pdf/renderer: that is used under
 * src/components/pdf/ for forms whose pixel geometry is fixed, which this is
 * not.
 */

// Relative imports WITH the .ts extension, not the `@/lib/...` alias, so
// `renderJobOrderSpecialOrder` below stays importable from
// supabase/tests/job-order-special-order-render.test.mts under Node's plain
// ESM loader (it cannot resolve the alias and requires the extension).
// `allowImportingTsExtensions` in tsconfig.json makes this equally valid for
// the Next/tsc build.
import { printHTMLContent } from "./print-html.ts";
import {
  BREAK_CONFIDENCE_PT,
  CONTENT_WIDTH_PT,
  PAGE_CAPACITY_PT,
  TAIL_BOTTOM_PT,
  escapeHtml,
  formatDocumentDate,
  fromIn,
  fromPx,
  lineBox,
  wrapLines,
} from "./print-geometry.ts";

// Hard-coded LGU Ozamiz City letterhead and signatories, matching the printed
// template — the same constants the memorandum carries. Overridable by env for
// the two that already have a project-wide variable; the rest can be promoted
// to a settings table later without touching this layout.
const CITY_MAYOR_NAME = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "SAM NORMAN G. FUENTES";
const CITY_MAYOR_POSITION = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "City Mayor";

/** Every Special Order is addressed to the City Administrator. */
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

/** Longer than the memorandum's — the SO copies the fiscal offices too. */
const COPIES_FURNISHED = [
  "City Budget Office",
  "City Accounting Office",
  "City Treasurer's Office",
  "City Human Resource Management Office",
];

/** The single closing line under the table. */
const CLOSING_LINE = "For strict compliance.";

export interface JobOrderSpecialOrderPrintRow {
  full_name: string;
  area_assigned: string | null;
}

export interface GenerateJobOrderSpecialOrderPrintParams {
  /** Printed as "SPECIAL ORDER NO. <soNo>". */
  soNo: string | null;
  subject: string;
  /** ISO date (yyyy-mm-dd). */
  soDate: string;
  /** Effectivity phrase interpolated into the body sentence, verbatim. */
  periodCovered: string | null;
  rows: JobOrderSpecialOrderPrintRow[];
}

/** The single body sentence as plain text — the geometry below measures it. */
function bodyText(periodCovered: string | null): string {
  const period = periodCovered ?? "";
  return `In the exigency of public service and the importance / necessity of timely access and delivery of public services the ensuing named personnel are directed to render additional time services during Saturdays and Holidays only effective ${period}; thus:`;
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
    /* The whole order is the single cell of a one-row frame table whose
       <tfoot> carries the validity note. A table footer group is the only
       element Chrome repeats on every printed page AND reserves flow space
       for, so the note prints at the foot of page after page with nothing
       running under it. position:fixed is not an alternative here: Chrome
       refuses to paint a fixed box into the @page margin and pushes it onto
       the next page. */
    table.page-frame { width: 100%; border-collapse: collapse; }
    table.page-frame > tbody > tr > td,
    table.page-frame > tfoot > tr > td {
      padding: 0;
      border: none;
      vertical-align: top;
    }
    /* One page of content tall, less the footer band (a hair under, so a
       rounding error cannot spill a blank page). That keeps the validity note
       at the foot of the sheet on an order far too short to reach it, instead
       of tucked under the signature halfway up the page. */
    .frame-body { min-height: 11.5in; }
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
    .so-title {
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
    /* Unlike the memorandum, the Special Order template sets the whole
       TO/FROM/SUBJECT/DATE value column in bold. */
    .fields .value { font-weight: bold; }
    /* The addressee's name carries the block in bold; his title and office sit
       a step down from it in regular weight, the title in italics. */
    .fields .addressee-title { font-weight: normal; font-style: italic; }
    .fields .addressee-office { font-weight: normal; }
    .xrule {
      display: flex;
      align-items: center;
      gap: 2px;
      margin: 10px 0 14px;
      font-size: 11pt;
    }
    .xrule .dashes { flex: 1; border-top: 1px dashed #000; }
    .body-text { text-align: justify; text-indent: 0.5in; margin-bottom: 12px; }
    /* Every paragraph of the order is indented the same half inch, the
       closing line under the table included. */
    .closing { text-align: justify; text-indent: 0.5in; margin-top: 16px; }
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
    table.members th { font-weight: bold; text-align: center; }
    table.members td.no { text-align: center; }
    table.members td.name { word-wrap: break-word; }
    table.members td.area { text-align: center; word-wrap: break-word; }
    /* Keep a row intact across a page break and repeat the header row. */
    table.members tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    /* The closing line, the signature block, the copies-furnished list and the
       last few table rows ride together: whichever page the signature lands
       on, those rows land above it, so the mayor never signs a page that opens
       with his own name — and the copies-furnished list can never be stranded
       alone on a page of its own (Chrome ignores break-before:avoid, so
       keeping it inside this group is the only way to hold it back).
       planTailHeightPt() gives the group an inline height reaching the foot of
       whatever page it lands on; the margin-top:auto below then spends that
       slack between the signature and the copies, which is what drops the
       list — and only the list — to the bottom of the sheet. */
    .tail {
      display: flex;
      flex-direction: column;
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
    .signature-name { font-size: 13pt; font-weight: bold; }
    .signature-position { font-style: italic; }
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
      <col style="width: 34%;">
      <col>
    </colgroup>`;

function buildMemberRows(
  rows: JobOrderSpecialOrderPrintRow[],
  startIndex: number,
): string {
  return rows
    .map(
      (r, i) => `
    <tr>
      <td class="no">${startIndex + i + 1}</td>
      <td class="name">${escapeHtml(r.full_name)}</td>
      <td class="area">${escapeHtml(r.area_assigned)}</td>
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
  rows: JobOrderSpecialOrderPrintRow[],
  startIndex: number,
  withHead: boolean,
): string {
  const head = withHead
    ? `
    <thead>
      <tr>
        <th>No.</th>
        <th>NAMES</th>
        <th>AREA ASSIGNED</th>
      </tr>
    </thead>`
    : "";

  return `
  <table class="members${withHead ? "" : " continued"}">${MEMBERS_COLGROUP}${head}
    <tbody>${buildMemberRows(rows, startIndex)}</tbody>
  </table>`;
}

/* ---------------------------------------------------------------------------
 * Pinning the copies-furnished list to the foot of the page
 *
 * Same problem and same solution as generateJobOrderMemo.ts: the list belongs
 * at the very bottom of the last page, immediately above the validity note,
 * which means the .tail group has to be as tall as whatever is left of the
 * page it lands on — its `margin-top: auto` on .copies then spends the
 * difference between the signature and the list. Chrome offers no way to
 * bottom-align a box on the *last* page only, so the distance is measured
 * here. Every constant below is derived from THIS file's stylesheet; the
 * shared page constants live in print-geometry.ts.
 *
 * When the model is not sure of itself — a cell whose text wraps within a hair
 * of its column edge, a page break that falls within a few points of a row
 * edge — it declines to pin and the list simply follows the signature.
 * ------------------------------------------------------------------------ */

/** The label column is 1.25in wide (border-box), the value takes the rest. */
const FIELD_VALUE_WIDTH_PT = CONTENT_WIDTH_PT - fromIn(1.25);

/** Members table columns, and what a cell loses to padding and its border. */
const CELL_CHROME_PT = fromPx(6) * 2 + fromPx(1);
const COL_NAME_PT = CONTENT_WIDTH_PT * 0.34;
const COL_AREA_PT = CONTENT_WIDTH_PT - fromIn(0.42) - COL_NAME_PT;

/** A one-line row: 3px of padding above and below, an 11pt line, one border. */
const ROW_BASE_PT = fromPx(6) + fromPx(1) + lineBox(11);
const ROW_EXTRA_LINE_PT = lineBox(11);
/** The table's own closing border, counted once. */
const TABLE_EDGE_PT = fromPx(1);

function rowHeightPt(row: JobOrderSpecialOrderPrintRow): {
  height: number;
  tight: boolean;
} {
  const name = wrapLines(row.full_name, COL_NAME_PT - CELL_CHROME_PT, 11);
  const area = wrapLines(
    row.area_assigned ?? "",
    COL_AREA_PT - CELL_CHROME_PT,
    11,
  );
  const lines = Math.max(name.lines, area.lines);
  return {
    height: ROW_BASE_PT + (lines - 1) * ROW_EXTRA_LINE_PT,
    tight: name.tight || area.tight,
  };
}

/** Letterhead through the body paragraph — everything above the table. */
function headHeightPt(
  subject: string,
  periodCovered: string | null,
): { height: number; tight: boolean } {
  const letterhead =
    lineBox(15) + lineBox(15) + lineBox(13) + CONTACT_LINES.length * lineBox(7.5);
  const rule = fromPx(6) + fromPx(6) + fromPx(14);
  const title = lineBox(15) + fromPx(18);

  const fieldRow = (content: number) => content + fromPx(6);
  // Name, then the title and office lines a step down from it.
  const addressee = lineBox(12) * 3;
  const subjectWrap = wrapLines(subject, FIELD_VALUE_WIDTH_PT, 12);
  const fields =
    fieldRow(addressee) +
    fieldRow(lineBox(12)) +
    fieldRow(lineBox(12) * subjectWrap.lines) +
    fieldRow(lineBox(12)) +
    // .fields' 12px bottom margin collapses with .xrule's 10px top margin.
    fromPx(12);

  const xrule = lineBox(11) + fromPx(14);
  const bodyWrap = wrapLines(
    bodyText(periodCovered),
    CONTENT_WIDTH_PT,
    12,
    fromIn(0.5),
  );
  // .body-text's 12px bottom margin collapses with the table's 6px top margin.
  const paragraph = lineBox(12) * bodyWrap.lines + fromPx(12);

  return {
    height: letterhead + rule + title + fields + xrule + paragraph,
    tight: subjectWrap.tight || bodyWrap.tight,
  };
}

/** Everything in .tail that is not a member row. */
function tailExtraPt(): { height: number; tight: boolean } {
  const closingWrap = wrapLines(CLOSING_LINE, CONTENT_WIDTH_PT, 12, fromIn(0.5));
  const closing = fromPx(16) + lineBox(12) * closingWrap.lines;
  const signature = fromIn(0.95) + lineBox(13) + lineBox(12);
  const copies =
    fromIn(0.4) + lineBox(7.5, 1.25) * (1 + COPIES_FURNISHED.length);
  return { height: closing + signature + copies, tight: closingWrap.tight };
}

/**
 * The height .tail needs for its copies-furnished list to sit at the foot of
 * the page it lands on, or null when the geometry is too close to call and the
 * group should keep its natural height.
 */
function planTailHeightPt(
  params: GenerateJobOrderSpecialOrderPrintParams,
  headRows: JobOrderSpecialOrderPrintRow[],
  tailRows: JobOrderSpecialOrderPrintRow[],
  isSplit: boolean,
): number | null {
  const head = headHeightPt(params.subject, params.periodCovered);
  const extra = tailExtraPt();
  let uncertain = head.tight || extra.tight;

  // The header row plus the table's own closing border. The row repeats at the
  // top of every page the table spans; on an order too short to split, the
  // whole table — header row and all — rides inside .tail instead.
  const tableTop = ROW_BASE_PT + TABLE_EDGE_PT;
  let y = head.height + (isSplit ? tableTop : 0);

  for (const row of headRows) {
    const { height, tight } = rowHeightPt(row);
    uncertain = uncertain || tight;
    if (Math.abs(PAGE_CAPACITY_PT - (y + height)) < BREAK_CONFIDENCE_PT) {
      uncertain = true;
    }
    y = y + height > PAGE_CAPACITY_PT ? tableTop + height : y + height;
  }

  let tailHeight = extra.height + (isSplit ? 0 : tableTop);
  for (const row of tailRows) {
    const { height, tight } = rowHeightPt(row);
    uncertain = uncertain || tight;
    tailHeight += height;
  }
  if (Math.abs(PAGE_CAPACITY_PT - (y + tailHeight)) < BREAK_CONFIDENCE_PT) {
    uncertain = true;
  }
  // .tail cannot be broken, so it moves whole to the next page when it does
  // not fit — and then starts at the very top of that page.
  if (y + tailHeight > PAGE_CAPACITY_PT) y = 0;

  if (uncertain) return null;
  const height = TAIL_BOTTOM_PT - y;
  return height > tailHeight ? height : null;
}

/**
 * The printed order groups its personnel by area assigned, alphabetically
 * within each area — the order the office reads the list in, regardless of how
 * the members were entered or came back from the query. Rows with no area sit
 * at the end rather than ahead of "Agriculture".
 */
function sortForPrint(
  rows: JobOrderSpecialOrderPrintRow[],
): JobOrderSpecialOrderPrintRow[] {
  return [...rows].sort((a, b) => {
    const areaA = a.area_assigned?.trim() ?? "";
    const areaB = b.area_assigned?.trim() ?? "";
    if (areaA !== areaB) {
      if (areaA === "") return 1;
      if (areaB === "") return -1;
      return areaA.localeCompare(areaB);
    }
    return a.full_name.localeCompare(b.full_name);
  });
}

export function renderJobOrderSpecialOrder(
  params: GenerateJobOrderSpecialOrderPrintParams,
): string {
  const { soNo, subject, soDate, periodCovered } = params;
  const rows = sortForPrint(params.rows);

  // Split the list so the last few rows can be kept with the signature block.
  const isSplit = rows.length >= MIN_ROWS_TO_SPLIT;
  const headRows = isSplit ? rows.slice(0, rows.length - SIGNATURE_TAIL_ROWS) : [];
  const tailRows = isSplit ? rows.slice(rows.length - SIGNATURE_TAIL_ROWS) : rows;

  // The height that puts the copies-furnished list at the foot of the page,
  // or null when the geometry is too close to call and the group keeps its
  // natural height.
  const tailHeightPt = planTailHeightPt(params, headRows, tailRows, isSplit);
  const tailStyle =
    tailHeightPt === null ? "" : ` style="height: ${tailHeightPt.toFixed(1)}pt;"`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Special Order ${escapeHtml(soNo ?? "")}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  <table class="page-frame">
  <tbody><tr><td>
  <div class="frame-body">
  <div class="sheet">
  ${buildLetterhead()}

  <div class="so-title">SPECIAL ORDER NO. ${escapeHtml(soNo ?? "")}</div>

  <table class="fields">
    <tr>
      <td class="label">TO:</td>
      <td class="value">
        <div>${escapeHtml(CITY_ADMINISTRATOR.name)}</div>
        <div class="addressee-title">${escapeHtml(CITY_ADMINISTRATOR.title)}</div>
        <div class="addressee-office">${escapeHtml(CITY_ADMINISTRATOR.office)}</div>
      </td>
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
      <td class="value">${escapeHtml(formatDocumentDate(soDate))}</td>
    </tr>
  </table>

  <div class="xrule"><span>X</span><span class="dashes"></span><span>X</span></div>

  <p class="body-text">${escapeHtml(bodyText(periodCovered))}</p>

  ${isSplit ? buildMembersTable(headRows, 0, true) : ""}

  <div class="tail"${tailStyle}>
    ${buildMembersTable(tailRows, rows.length - tailRows.length, !isSplit)}

    <p class="closing">${escapeHtml(CLOSING_LINE)}</p>

    <div class="signature">
      <div class="signature-name">${escapeHtml(CITY_MAYOR_NAME())}</div>
      <div class="signature-position">${escapeHtml(CITY_MAYOR_POSITION())}</div>
    </div>

    <div class="copies">
      <div>Copies furnished:</div>
      ${COPIES_FURNISHED.map((l) => `<div>${escapeHtml(l)}</div>`).join("\n      ")}
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

export function generateJobOrderSpecialOrderPrint(
  params: GenerateJobOrderSpecialOrderPrintParams,
): void {
  printHTMLContent(renderJobOrderSpecialOrder(params));
}
