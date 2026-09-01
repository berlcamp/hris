/**
 * PDF generators for the Job Order payroll module. Three documents, all built
 * from the same member rows:
 *
 *   generateJoPayrollPrint        -> the DAILY WAGES PAYROLL form (below)
 *   generateJoPayrollSummaryPrint -> SUMMARY OF PAYROLLS, one line per printed
 *                                    page of the form above, net amounts
 *   generateJoPayrollObrPrint     -> the Obligation Request, one form for the
 *                                    whole payroll at gross
 *
 * The main form's layout is shaped by two independent booleans on the params:
 *
 *   withAtm  -> trailing column is the Landbank ATM savings account number,
 *               or (false) the Community Tax group: Number / Date / Place
 *               Issued
 *   showSss  -> SS / EC deduction columns are populated and subtracted from
 *               net pay, or (false) left blank with net pay equal to gross
 *
 * Neither affects which members print: every member of the payroll is listed
 * in all four combinations, so SUB TOTAL's gross never moves between them.
 *
 * Ten variants ported from the legacy Laravel JopayrollController (no-SSS, by
 * department, summary, cash-payable, overtime ×2, summary+overtime, OBR ×2)
 * were dropped once the office settled on this one form — see git history if
 * one is ever wanted back.
 *
 * Expects a list of payroll rows already joined with the employee, plus the
 * parent payroll's period for the title.
 */

import {
  computeJoGross,
  computeJoOvertimeGross,
  DAILY_WAGES_ROWS_PER_PAGE,
  paginateDailyWages,
} from "@/lib/job-order-payroll-helpers";
import type { JobOrderPayrollPrintRow } from "@/lib/job-order-payroll-helpers";
import { generatePayrollOBRPrint } from "@/lib/pdf/generatePayroll";

// Hard-coded LGU Ozamiz City signatory block — matches the printed Daily Wages
// Payroll template the accounting office uses. If these names ever change, the
// values can be promoted to a settings table without altering the layout.
const DAILY_WAGES_SIGNATORIES = {
  accountantName: "EASY XAFLAVAIRE HOPE E. DIMAL",
  accountantTitle: "CITY ACCOUNTANT",
  foreman: { name: "CAROLYN N. GO", title: "Executive Assistant IV" },
  approver: { name: "RUTHEZA GRACE A. OUANO", title: "City Admistrator" },
  treasurer: { name: "JULIE FE C. NAPIGKIT", title: "City Treasurer" },
  agencyName: "LGU OZAMIZ CITY",
  // Fixed on both printables. This used to interpolate the payroll's
  // denormalized `areas` label, which made the heading drift with whichever
  // areas the members happened to belong to; the form is always issued under
  // the Office of the City Mayor.
  officeName: "Office of the City Mayor",
};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** @deprecated alias kept so the generator signatures below stay untouched. */
export type JoPayrollPrintRow = JobOrderPayrollPrintRow;

export interface GenerateJoPayrollPrintParams {
  rows: JoPayrollPrintRow[];
  periodStart: string;
  periodEnd: string;
  /** The payroll's particulars, printed verbatim as the OBR's PARTICULARS. */
  particulars?: string | null;
  /**
   * Trailing column group: the Landbank ATM account number (one column) when
   * true, the Community Tax details (Number / Date / Place Issued) when false.
   */
  withAtm: boolean;
  /**
   * Populate the SS / EC deduction columns and subtract them from net pay.
   * When false the two columns are still drawn — just left blank, and net pay
   * equals gross — so the office's preprinted forms line up either way.
   *
   * Required rather than defaulted: the only caller drives this from a
   * checkbox, and a silent default would let a future call site print a
   * payroll whose net pay quietly disagrees with the members table.
   */
  showSss: boolean;
  /** Renders a diagonal DRAFT watermark. Set when payroll.status === "draft". */
  draft?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Like fmt but renders whole numbers without decimals (e.g. 480, 750, 10). */
function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "";
  if (Number.isInteger(n)) return Number(n).toLocaleString("en-PH");
  return fmt(n);
}

function formatPeriodHeader(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const month = s.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const startDay = s.getDate();
  const endDay = e.getDate();
  const year = e.getFullYear();
  // Cross-month if month differs.
  if (s.getMonth() !== e.getMonth() || s.getFullYear() !== e.getFullYear()) {
    const monthEnd = e.toLocaleString("en-US", { month: "long" }).toUpperCase();
    return `${month} ${startDay} - ${monthEnd} ${endDay}, ${year}`;
  }
  return `${month} ${startDay}-${endDay}, ${year}`;
}

function printHTMLContent(htmlContent: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  let isCleanedUp = false;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  let afterPrintHandler: (() => void) | null = null;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    try {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      if (afterPrintHandler && iframe.contentWindow) {
        try {
          iframe.contentWindow.removeEventListener(
            "afterprint",
            afterPrintHandler,
          );
        } catch {
          // ignore
        }
      }
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch {
      // ignore
    }
  };

  const printIframe = () => {
    if (isCleanedUp) return;
    try {
      if (!iframe.contentWindow || !iframe.parentNode) {
        cleanup();
        return;
      }
      cleanupTimeout = setTimeout(cleanup, 5000);
      afterPrintHandler = () => {
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        cleanup();
      };
      try {
        iframe.contentWindow.addEventListener("afterprint", afterPrintHandler, {
          once: true,
        });
        iframe.contentWindow.print();
      } catch {
        cleanup();
      }
    } catch {
      cleanup();
    }
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    cleanup();
    return;
  }
  try {
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    let hasPrinted = false;
    iframe.onload = () => {
      setTimeout(() => {
        if (
          !hasPrinted &&
          !isCleanedUp &&
          iframe.contentWindow &&
          iframe.parentNode
        ) {
          hasPrinted = true;
          printIframe();
        }
      }, 250);
    };
    setTimeout(() => {
      if (
        !hasPrinted &&
        !isCleanedUp &&
        iframe.parentNode &&
        iframe.contentWindow
      ) {
        hasPrinted = true;
        printIframe();
      }
    }, 1000);
  } catch {
    cleanup();
  }
}

// This module renders each printable as an HTML string played through an
// iframe's native print (`printHTMLContent`), not @react-pdf/renderer — that
// library is used elsewhere under src/components/pdf/ but not here. The
// watermark below is the HTML/CSS equivalent of the brief's react-pdf
// <Text style={{position:"absolute", transform:"rotate(-30deg)"}}> snippet:
// same visual result (centered, rotated, translucent grey "DRAFT"), just
// expressed in the DOM this file actually builds.
//
// Getting it BEHIND the table is not a matter of DOM order the way it is in
// react-pdf's sequential-canvas model. In real CSS, a positioned descendant
// with z-index: auto or >= 0 paints above non-positioned in-flow siblings
// regardless of where it sits in the markup — so being "first child" alone
// would still paint on top of the table, not behind it. `z-index: -1` is
// what actually pushes it below: per the CSS painting order, a negative
// z-index descendant paints above its stacking-context root's own
// background/border but below that root's non-positioned in-flow content
// (here, the table). `.draft-watermark`'s stacking-context root is `body`,
// which sets no background-color, so there is nothing opaque for the
// watermark to sink beneath.
//
// `position: fixed`, verified against a real multi-page print (Task 8): the
// payroll renders exactly one `.draft-watermark` div for the ENTIRE document,
// positioned `top: 45%` of `body`. With `position: absolute` that 45% is
// relative to the whole flowed document's height, not each physical page, so
// on a payroll spanning N printed pages the watermark only ever lands once,
// on whichever single page happens to sit at the document's vertical
// midpoint — confirmed by rendering a 150-row payroll to a 5-page PDF: pages
// 1, 2, 4 and 5 came back completely unmarked, only page 3 (the midpoint)
// showed it. `position: fixed` is anchored to each page box during paginated
// media instead of the document's total height, so browsers repaint it on
// every physical page — confirmed by re-rendering the same 5-page PDF after
// this change: all 5 pages now show it.
const WATERMARK_STYLES = `
  .draft-watermark {
    position: fixed;
    top: 45%;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 72pt;
    color: #e5e5e5;
    transform: rotate(-30deg);
    opacity: 0.5;
    pointer-events: none;
    z-index: -1;
  }
`;

/**
 * Rendered first inside `<body>`. DOM order doesn't matter for stacking here —
 * `.draft-watermark`'s negative z-index (see WATERMARK_STYLES above) is what
 * actually keeps it behind the table. Returns "" (not rendered) when not
 * draft.
 */
function renderDraftWatermark(draft: boolean | undefined): string {
  if (!draft) return "";
  return `<div class="draft-watermark">DRAFT</div>`;
}

// ---------------------------------------------------------------------------
// Daily Wages Payroll (LGU Ozamiz template)
// ---------------------------------------------------------------------------
// `withAtm` swaps only the trailing column group; everything to its left is
// identical. `showSss` is the second, independent axis. Neither changes which
// members are listed — see GenerateJoPayrollPrintParams.

const DAILY_WAGES_STYLES = `
  @page { size: legal landscape; margin: 0.3in; }
  /* margin: 0 is load-bearing now that .payroll-page fills the sheet. The UA
     stylesheet's default 8px body margin is inside the @page margin box, so
     it steals 16px of the height the sheet is sized against and pushes the
     footer's bottom border onto a sheet of its own. */
  body { margin: 0; position: relative; font-family: "Times New Roman", Times, serif; font-size: 9pt; line-height: 1.2; color: #000; }
  ${WATERMARK_STYLES}
  .report-header { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: start; margin-bottom: 2px; }
  .report-header .center { text-align: center; }
  .report-header .right { text-align: center; }
  .report-title { font-size: 13pt; font-weight: bold; }
  .report-sub { font-size: 9pt; margin-top: 2px; }
  .accountant-name { font-weight: bold; font-size: 10pt; }
  .accountant-title { font-size: 9pt; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 0 4px; }
  .meta-row .agency { font-weight: bold; font-size: 10pt; }
  .meta-row .agency u { text-decoration: underline; }
  .meta-row .period { font-weight: bold; font-size: 10pt; }
  .meta-row .period u { text-decoration: underline; }
  table.payroll { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* Only a page carrying a full roster stretches. flex: 1 hands the sheet's
     leftover height (see .payroll-page) to the table, and the browser spreads
     it across the rows: a full page breathes into the space instead of leaving
     a band of white above the signatories, and a full page whose names wrap
     gives that same surplus straight back rather than spilling onto another
     sheet -- the padding below is only the floor. A short final page must NOT
     stretch: three names sharing seven inches would print rows over an inch
     tall. It leaves the white above the footer instead. */
  table.payroll.stretch { flex: 1 1 auto; }
  table.payroll th, table.payroll td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; word-wrap: break-word; }
  table.payroll thead th { font-weight: bold; text-align: center; font-size: 8pt; line-height: 1.15; }
  table.payroll tbody td { font-size: 8.5pt; padding: 6px 3px; }
  /* A stretching page gets its row height from the leftover space instead, so
     its floor is deliberately lower than the short page's fixed padding: a
     full roster whose names wrap needs every point it can give back, and the
     stretch has already made those rows taller than this floor anyway. */
  table.payroll.stretch tbody td { padding: 3px 3px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .signature-cell { position: relative; padding-left: 14px !important; }
  .sig-num { position: absolute; left: 2px; top: 2px; font-size: 7pt; }
  tr.subtotal td { font-weight: bold; }
  /* margin-top:auto is what pushes the block to the foot of the sheet -- see
     the .payroll-page flex column below. */
  table.footer-table { width: 100%; border-collapse: collapse; margin-top: auto; }
  table.footer-table td { border: 1px solid #000; vertical-align: top; padding: 4px 6px; height: 1.6in; width: 25%; }
  .foot-label { font-weight: bold; font-size: 9pt; }
  .foot-text { font-size: 9pt; margin-top: 4px; text-indent: 18px; }
  .foot-name { text-align: center; font-weight: bold; font-size: 10pt; margin-top: 48px; }
  .foot-title { text-align: center; font-size: 9pt; }
  .foot-role { text-align: center; font-size: 8.5pt; margin-top: 6px; }
  .foot-line { text-align: center; margin-top: 56px; border-top: 1px solid #000; padding-top: 0; min-height: 1px; }
  /* One .payroll-page per printed sheet. The break is forced rather than left
     to the browser because the Summary of Payrolls numbers its lines after
     these pages -- see DAILY_WAGES_ROWS_PER_PAGE. The :last-child rule keeps
     the final break from emitting a trailing blank sheet.
     The sheet is a full-height flex column so a page carrying fewer than
     DAILY_WAGES_ROWS_PER_PAGE names still fills the paper: the table stays at
     the top and the signatory footer is pushed to the bottom edge by its
     margin-top:auto instead of floating up under a short roster.
     min-height, not height: legal landscape less the 0.3in @page margins is
     8.5 - 0.6 = 7.9in, and min-height lets a row that wraps (a long name in
     the no-ATM layout) grow the box rather than spill out of a fixed one. */
  .payroll-page { display: flex; flex-direction: column; min-height: 7.9in; break-after: page; page-break-after: always; }
  .payroll-page:last-child { break-after: auto; page-break-after: auto; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

function renderDailyWagesHeader(
  periodHeader: string,
): string {
  const agencyLine = `<u>${escapeHtml(DAILY_WAGES_SIGNATORIES.agencyName)}</u> - ${escapeHtml(DAILY_WAGES_SIGNATORIES.officeName)}`;

  return `
    <div class="report-header">
      <div></div>
      <div class="center">
        <div class="report-title">DAILY WAGES PAYROLL</div>
        <div class="report-sub">AUGMENTATION OF SALARIES &amp; WAGES - JOB ORDER</div>
      </div>
      <div class="right">
        <div class="accountant-name">${escapeHtml(DAILY_WAGES_SIGNATORIES.accountantName)}</div>
        <div class="accountant-title">${escapeHtml(DAILY_WAGES_SIGNATORIES.accountantTitle)}</div>
      </div>
    </div>
    <div class="meta-row">
      <div class="agency">${agencyLine}</div>
      <div class="period">Period: <u>${periodHeader}</u></div>
    </div>`;
}

function renderDailyWagesFooter(): string {
  return `
    <table class="footer-table">
      <tr>
        <td>
          <div class="foot-label">CERTIFY:</div>
          <div class="foot-text">Each person whose name appears on this roll had rendered services for the time stated.</div>
          <div class="foot-name">${escapeHtml(DAILY_WAGES_SIGNATORIES.foreman.name)}</div>
          <div class="foot-title">${escapeHtml(DAILY_WAGES_SIGNATORIES.foreman.title)}</div>
          <div class="foot-role">Name &amp; Signature of Foreman/Supervisor</div>
        </td>
        <td>
          <div class="foot-label">Approved for Payment:</div>
          <div class="foot-name">${escapeHtml(DAILY_WAGES_SIGNATORIES.approver.name)}</div>
          <div class="foot-title">${escapeHtml(DAILY_WAGES_SIGNATORIES.approver.title)}</div>
          <div class="foot-role">Name &amp; Signature of Approving Officer</div>
        </td>
        <td>
          <div class="foot-text" style="text-indent:0;">CERTIFIED: Funds available in the amount of Php ______________</div>
          <div class="foot-name">${escapeHtml(DAILY_WAGES_SIGNATORIES.treasurer.name)}</div>
          <div class="foot-title">${escapeHtml(DAILY_WAGES_SIGNATORIES.treasurer.title)}</div>
        </td>
        <td>
          <div class="foot-text" style="text-indent:0;">Each person whose name appears on the above roll has been paid the amount stated opposite his/her name after identifying him.</div>
          <div class="foot-line">&nbsp;</div>
          <div class="foot-role">Name &amp; Signature of Disbursing Officer</div>
        </td>
      </tr>
    </table>`;
}

function renderDailyWagesPayroll({
  rows,
  periodStart,
  periodEnd,
  withAtm,
  showSss,
  draft,
}: GenerateJoPayrollPrintParams): string {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  // Sorted by name and cut into printed pages by the same function the Summary
  // of Payrolls uses, so its numbered lines always describe these pages.
  const pages = paginateDailyWages(rows);

  // NO. through SIGNATURE — identical in both variants.
  //
  // NAME is 2.4in, not the 1.9in it used to be. The form never spent the
  // paper it had: even the wider of the two layouts (Community Tax) totalled
  // 12.85in of the 13.4in a legal sheet leaves between the 0.3in @page
  // margins, and 1.9in of Times at 8.5pt runs out around thirty characters —
  // short of what a Filipino full name in "SURNAME, GIVEN MIDDLE" order
  // actually needs, so a real roster wrapped a third of its rows to two
  // lines. Those wraps are what push a full page past the bottom of the
  // sheet. The extra 0.5in comes out of the slack, not out of another
  // column: no-ATM now totals 13.35in and ATM 12.2in, both still inside the
  // printable width, and every other column keeps the width it had.
  const leadingColWidths = [
    "0.4in", "2.4in", "0.85in", "0.55in", "0.5in", "0.85in", "0.6in",
    "0.55in", "0.7in", "0.85in", "0.45in", "0.45in", "0.85in", "1.1in",
  ];
  // Community Tax group, sized against the roster's real values rather than
  // the header labels: NUMBER holds an 8-digit CTC serial, DATE a 10-character
  // ISO date, and PLACE ISSUED "OZAMIZ CITY". It used to be 0.9 / 0.75 / 0.6,
  // which starved PLACE ISSUED into wrapping to two lines on EVERY row and
  // made this layout hold barely half the names per page that the ATM one
  // does. Same 2.25in total, so nothing else on the form moves.
  const colgroup = [
    ...leadingColWidths,
    ...(withAtm ? ["1.1in"] : ["0.6in", "0.7in", "0.95in"]),
  ]
    .map((w) => `<col style="width:${w}">`)
    .join("");

  // The Community Tax group spans the top two header bands so its three
  // sub-heads land on the same bottom band as SSS's SS / EC.
  const trailingHeader = withAtm
    ? `<th rowspan="3">LANDBANK ATM SAVINGS ACCT. NUMBER</th>`
    : `<th colspan="3" rowspan="2">Community Tax</th>`;
  const trailingSubHeader = withAtm
    ? ""
    : `<th>Number</th><th>Date</th><th>Place Issued</th>`;

  // Trailing blanks on a totals row: signature + (ATM | the three CT columns).
  const trailingTotalCells = withAtm
    ? `<td></td><td></td>`
    : `<td></td><td></td><td></td><td></td>`;

  const totalsRow = (
    label: string,
    gross: number,
    ss: number,
    ec: number,
    net: number,
  ): string => `
      <tr class="subtotal">
        <td></td>
        <td class="text-left">${label}</td>
        <td colspan="7"></td>
        <td class="text-right">${fmt(gross)}</td>
        <td class="text-right">${showSss ? fmt(ss) : ""}</td>
        <td class="text-right">${showSss ? fmt(ec) : ""}</td>
        <td class="text-right">${fmt(net)}</td>
        ${trailingTotalCells}
      </tr>`;

  // NO. runs unbroken across pages: it numbers the payee on the payroll, not
  // the line on the sheet.
  let rowNumber = 0;
  let grandGross = 0;
  let grandSs = 0;
  let grandEc = 0;
  let grandNet = 0;

  const pageBlocks = pages.map((page, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;

    let pageGross = 0;
    let pageSs = 0;
    let pageEc = 0;
    let pageNet = 0;

    const bodyRows = page.members
      .map((m) => {
        rowNumber += 1;
        const daysPay = computeJoGross(m.rate, m.days);
        const ratePerHour = (m.rate ?? 0) / 8;
        const otPay = computeJoOvertimeGross(m.rate, m.hours);
        const gross = daysPay + otPay;
        const ss = showSss ? m.sss_ss ?? 0 : 0;
        const ec = showSss ? m.sss_ec ?? 0 : 0;
        const net = gross - ss - ec;

        pageGross += gross;
        pageSs += ss;
        pageEc += ec;
        pageNet += net;

        const hasOt = (m.hours ?? 0) > 0;

        const trailingCells = withAtm
          ? `<td class="text-center">${escapeHtml(m.account_number)}</td>`
          : `<td class="text-center">${escapeHtml(m.tax_number)}</td>
          <td class="text-center">${escapeHtml(m.tax_date)}</td>
          <td class="text-center">${escapeHtml(m.tax_issued)}</td>`;

        return `
        <tr>
          <td class="text-center">${rowNumber}</td>
          <td class="text-left">${escapeHtml(m.fullname)}</td>
          <td class="text-center">JOB ORDER</td>
          <td class="text-center">${m.days ?? ""}</td>
          <td class="text-right">${fmtInt(m.rate)}</td>
          <td class="text-right">${fmt(daysPay)}</td>
          <td class="text-center">${hasOt ? fmt(m.hours) : ""}</td>
          <td class="text-right">${hasOt ? fmt(ratePerHour) : ""}</td>
          <td class="text-right">${hasOt ? fmt(otPay) : ""}</td>
          <td class="text-right">${fmt(gross)}</td>
          <td class="text-right">${showSss ? fmtInt(m.sss_ss) : ""}</td>
          <td class="text-right">${showSss ? fmtInt(m.sss_ec) : ""}</td>
          <td class="text-right">${fmt(net)}</td>
          <td class="signature-cell"><span class="sig-num">${rowNumber}</span></td>
          ${trailingCells}
        </tr>`;
      })
      .join("");

    grandGross += pageGross;
    grandSs += pageSs;
    grandEc += pageEc;
    grandNet += pageNet;

    // SUB TOTAL closes every page — it is this page's money, and the Summary's
    // line for this page carries the same figure. The grand TOTAL is added
    // only when there is more than one page to add up; a single-page payroll
    // prints exactly the one SUB TOTAL it always has.
    //
    // The certification block below repeats on every sheet with it: each page
    // is signed for the names it carries, so a page that leaves the office on
    // its own still says who certified those hours and who approved that
    // money.
    const grandTotalRow =
      isLastPage && pages.length > 1
        ? totalsRow("TOTAL", grandGross, grandSs, grandEc, grandNet)
        : "";

    // Only a page holding a full roster stretches its rows to the footer --
    // see table.payroll.stretch in DAILY_WAGES_STYLES.
    const stretch = page.members.length >= DAILY_WAGES_ROWS_PER_PAGE;

    return `
  <div class="payroll-page">
    ${renderDailyWagesHeader(periodHeader)}
    <table class="payroll${stretch ? " stretch" : ""}">
      <colgroup>${colgroup}</colgroup>
      <thead>
        <tr>
          <th rowspan="3">NO.</th>
          <th rowspan="3">NAME</th>
          <th rowspan="3">Designation</th>
          <th rowspan="3">No. of Days Worked</th>
          <th rowspan="3">Rate Per Day</th>
          <th rowspan="3">Total Pay on Days Worked</th>
          <th rowspan="3">Add'l Time Services</th>
          <th rowspan="3">Rate per Hour</th>
          <th rowspan="3">Overtime Pay</th>
          <th rowspan="3">GROSS PAY</th>
          <th colspan="2">DEDUCTIONS</th>
          <th rowspan="3">NET PAY</th>
          <th rowspan="3">SIGNATURE</th>
          ${trailingHeader}
        </tr>
        <tr>
          <th colspan="2">SSS</th>
        </tr>
        <tr>
          <th>SS</th>
          <th>EC</th>
          ${trailingSubHeader}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        ${totalsRow("SUB TOTAL", pageGross, pageSs, pageEc, pageNet)}
        ${grandTotalRow}
      </tbody>
    </table>
    ${renderDailyWagesFooter()}
  </div>`;
  });

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Daily Wages Payroll${withAtm ? "" : " (Without ATM)"}</title>
<style>${DAILY_WAGES_STYLES}</style></head>
<body>
  ${renderDraftWatermark(draft)}
  ${pageBlocks.join("\n")}
</body></html>`;
}

export function generateJoPayrollPrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(renderDailyWagesPayroll(params));
}

// ---------------------------------------------------------------------------
// Summary of Payrolls
// ---------------------------------------------------------------------------
// One line per printed page of the Daily Wages Payroll — the "payroll number"
// on this form is the page's position, not a database id. It used to be one
// line per distinct daily rate, which had nothing to do with how the payroll
// actually prints: a twelve-member payroll that fits on a single page was
// summarized as payrolls 1 and 2 because those twelve people happened to be on
// two different rates. Both documents now cut their pages with
// `paginateDailyWages`, so the count and the order cannot drift apart.
//
// Amounts are NET (gross less the SSS shares), which is why `showSss` reaches
// this document too: with the deductions switched off, net collapses back to
// gross and the two amount columns still agree with the Daily Wages form's
// SUB TOTAL for the same page.
//
// "Amount paid on payroll" repeats the amount and "Amount unpaid on rolls" is
// left blank: nothing in this module tracks partial disbursement, so the
// office fills that column in by hand when a payee does not collect.

/** Blank rows are padded out to this many body rows so the ruled form keeps a
 * constant height regardless of how many rates a payroll happens to have. */
const SUMMARY_BODY_ROWS = 25;

const SUMMARY_STYLES = `
  @page { size: legal portrait; margin: 0.5in; }
  body { position: relative; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.2; color: #000; }
  ${WATERMARK_STYLES}
  .report-title { text-align: center; font-size: 14pt; font-weight: bold; }
  .report-sub { text-align: center; font-size: 13pt; font-weight: bold; margin-top: 6px; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 0 4px; font-weight: bold; font-size: 10.5pt; }
  table.summary { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.summary th, table.summary td { border: 1px solid #000; padding: 3px 6px; height: 22px; }
  table.summary thead th { font-weight: bold; text-align: center; font-size: 10.5pt; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  tr.total td { font-weight: bold; }
  .certified { font-style: italic; }
  .ledger-block td { height: 1.6in; vertical-align: top; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export function generateJoPayrollSummaryPrint({
  rows,
  periodStart,
  periodEnd,
  showSss,
  draft,
}: GenerateJoPayrollPrintParams): void {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const pages = paginateDailyWages(rows);

  let total = 0;
  const bodyRows = pages
    .map((page, i) => {
      const amount = showSss ? page.totalNet : page.totalGross;
      total += amount;
      return `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td class="text-center">${fmt(amount)}</td>
          <td class="text-center">${fmt(amount)}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  const fillerCount = Math.max(0, SUMMARY_BODY_ROWS - pages.length - 1);
  const fillerRows = `<tr><td></td><td></td><td></td><td></td></tr>`.repeat(
    fillerCount,
  );

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Summary of Payrolls</title>
<style>${SUMMARY_STYLES}</style></head>
<body>
  ${renderDraftWatermark(draft)}
  <div class="report-title">SUMMARY OF PAYROLLS</div>
  <div class="report-sub">JOB ORDER SERVICES</div>
  <div class="meta-row">
    <div>AGENCY: ${escapeHtml(DAILY_WAGES_SIGNATORIES.officeName.toUpperCase())}</div>
    <div>${periodHeader}</div>
  </div>
  <table class="summary">
    <colgroup>
      <col style="width:22%">
      <col style="width:24%">
      <col style="width:27%">
      <col style="width:27%">
    </colgroup>
    <thead>
      <tr>
        <th>PAYROLL NUMBER</th>
        <th>AMOUNT OF PAYROLL</th>
        <th>AMOUNT PAID ON PAYROLL</th>
        <th>AMOUNT UNPAID ON ROLLS</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total">
        <td class="text-center">TOTAL</td>
        <td class="text-center">${fmt(total)}</td>
        <td class="text-center">${fmt(total)}</td>
        <td></td>
      </tr>
      ${fillerRows}
      <tr>
        <td></td>
        <td></td>
        <td class="certified">CERTIFIED CORRECT:</td>
        <td></td>
      </tr>
      <tr>
        <td>ACCOUNT CODE</td>
        <td>DEBIT</td>
        <td class="text-right">CREDIT</td>
        <td>CERTIFIED CORRECT:</td>
      </tr>
      <tr class="ledger-block">
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body></html>`;

  printHTMLContent(html);
}

// ---------------------------------------------------------------------------
// Obligation Request (OBR)
// ---------------------------------------------------------------------------

/** Job Order services — "Other General Services" in the chart of accounts. */
const JO_OBR_ACCOUNT_CODE = "5-02-12-020";

/**
 * One OBR for the whole payroll, at GROSS.
 *
 * Gross, not net, because the obligation charged against the appropriation is
 * the full payroll cost — the SSS employee share is withheld at disbursement,
 * not subtracted from what is obligated. So unlike the Summary this total does
 * not follow `showSss`.
 *
 * The form itself is the regular payroll module's OBR (`generatePayrollOBRPrint`),
 * reused rather than reimplemented: same office, same signatories, same
 * responsibility center, so a second copy would be one more place to update
 * when a signatory changes. Only the payee, particulars, account code and
 * amount differ.
 */
export function generateJoPayrollObrPrint({
  rows,
  particulars,
}: GenerateJoPayrollPrintParams): void {
  // Alphabetical, matching the order the Daily Wages form prints in, so the
  // payee is literally the first name on page 1 of the payroll.
  const firstName =
    [...rows].sort((a, b) => a.fullname.localeCompare(b.fullname))[0]
      ?.fullname ?? "";

  const totalGross = rows.reduce(
    (sum, m) =>
      sum + computeJoGross(m.rate, m.days) + computeJoOvertimeGross(m.rate, m.hours),
    0,
  );

  generatePayrollOBRPrint({
    particulars: particulars ?? "",
    totalAmount: totalGross,
    accountCode: JO_OBR_ACCOUNT_CODE,
    payee: firstName ? `${firstName} AND COMPANY` : "",
  });
}
