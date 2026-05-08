/**
 * PDF generators for the Job Order payroll module.
 *
 * Maps the legacy Laravel JopayrollController print methods to TS exports:
 *
 *   print()                  -> generateJoPayrollPrint
 *   printnoss()              -> generateJoPayrollNoSssPrint
 *   printByDepartment()      -> generateJoPayrollByDeptPrint
 *   printSummary()           -> generateJoPayrollSummaryPrint
 *   printNoATM()             -> generateJoPayrollNoAtmPrint
 *   printOvertime()          -> generateJoPayrollOvertimePrint
 *   printOvertimeNoAtm()     -> generateJoPayrollOvertimeNoAtmPrint
 *   printSummaryOvertime()   -> generateJoPayrollSummaryOvertimePrint
 *   printOBR()               -> generateJoPayrollObrPrint
 *   printOBROvertime()       -> generateJoPayrollObrOvertimePrint
 *
 * Each function expects a list of payroll rows already joined with the
 * employee, plus the parent payroll's period for the title.
 */

import {
  computeJoGross,
  computeJoNetAmount,
  computeJoOvertimeGross,
  groupMembersByRate,
} from "@/lib/utils/joPayrollAmount";

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
};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Flattened member-with-employee row used by every payroll PDF. */
export interface JoPayrollPrintRow {
  fullname: string;
  area_assigned: string | null;
  rate: number | null;
  days: number | null;
  hours: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  account_number: string | null;
  tax_number: string | null;
  tax_date: string | null;
  tax_issued: string | null;
}

export interface GenerateJoPayrollPrintParams {
  rows: JoPayrollPrintRow[];
  periodStart: string;
  periodEnd: string;
  particulars?: string | null;
  description?: string | null;
  /** Comma-separated areas captured on the parent payroll, used in the header. */
  areas?: string | null;
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

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.2; color: #000; }
  h1.title { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 2px; }
  h2.subtitle { text-align: center; font-size: 10pt; margin-bottom: 4px; }
  h3.particulars { text-align: center; font-size: 9pt; font-weight: normal; margin-bottom: 6px; }
  table.payroll { width: 100%; border-collapse: collapse; }
  table.payroll th, table.payroll td { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; }
  table.payroll thead th { background-color: #e5e7eb; text-align: center; font-size: 8pt; }
  table.payroll tbody td { font-size: 8pt; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .group-header td { background-color: #f9fafb; font-weight: bold; font-size: 9pt; }
  .group-total td { background-color: #f3f4f6; font-weight: bold; }
  .grand-total td { background-color: #e5e7eb; font-weight: bold; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

// ---------------------------------------------------------------------------
// 1 & 2. Daily Wages Payroll (LGU Ozamiz template) — with / without SSS
// ---------------------------------------------------------------------------
// The two variants share one rendering function. `showSss` controls whether
// the SS / EC deduction columns are populated and subtracted from net pay.
// The column layout is identical in both cases so the office's preprinted
// forms align consistently.

const DAILY_WAGES_STYLES = `
  @page { size: legal landscape; margin: 0.3in; }
  body { font-family: "Times New Roman", Times, serif; font-size: 9pt; line-height: 1.2; color: #000; }
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
  table.payroll th, table.payroll td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; word-wrap: break-word; }
  table.payroll thead th { font-weight: bold; text-align: center; font-size: 8pt; line-height: 1.15; }
  table.payroll tbody td { font-size: 8.5pt; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .signature-cell { position: relative; padding-left: 14px !important; }
  .sig-num { position: absolute; left: 2px; top: 2px; font-size: 7pt; }
  tr.subtotal td { font-weight: bold; }
  table.footer-table { width: 100%; border-collapse: collapse; margin-top: 0; }
  table.footer-table td { border: 1px solid #000; vertical-align: top; padding: 4px 6px; height: 1.3in; width: 25%; }
  .foot-label { font-weight: bold; font-size: 9pt; }
  .foot-text { font-size: 9pt; margin-top: 4px; text-indent: 18px; }
  .foot-name { text-align: center; font-weight: bold; font-size: 10pt; margin-top: 32px; }
  .foot-title { text-align: center; font-size: 9pt; }
  .foot-role { text-align: center; font-size: 8.5pt; margin-top: 6px; }
  .foot-line { text-align: center; margin-top: 38px; border-top: 1px solid #000; padding-top: 0; min-height: 1px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

function renderDailyWagesHeader(
  periodHeader: string,
  areas: string | null | undefined,
): string {
  const headerArea = areas?.trim();
  const agencyLine = headerArea
    ? `<u>${escapeHtml(DAILY_WAGES_SIGNATORIES.agencyName)}</u> - ${escapeHtml(headerArea)}`
    : `<u>${escapeHtml(DAILY_WAGES_SIGNATORIES.agencyName)}</u>`;

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

interface RenderDailyWagesParams extends GenerateJoPayrollPrintParams {
  showSss: boolean;
}

function renderDailyWagesPayroll({
  rows,
  periodStart,
  periodEnd,
  areas,
  showSss,
}: RenderDailyWagesParams): string {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const sorted = [...rows].sort((a, b) => a.fullname.localeCompare(b.fullname));

  let totalGross = 0;
  let totalSs = 0;
  let totalEc = 0;
  let totalNet = 0;

  const bodyRows = sorted
    .map((m, i) => {
      const daysPay = computeJoGross(m.rate, m.days);
      const ratePerHour = (m.rate ?? 0) / 8;
      const otPay = computeJoOvertimeGross(m.rate, m.hours);
      const gross = daysPay + otPay;
      const ss = showSss ? m.sss_ss ?? 0 : 0;
      const ec = showSss ? m.sss_ec ?? 0 : 0;
      const net = gross - ss - ec;

      totalGross += gross;
      totalSs += ss;
      totalEc += ec;
      totalNet += net;

      const hasOt = (m.hours ?? 0) > 0;

      return `
        <tr>
          <td class="text-center">${i + 1}</td>
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
          <td class="signature-cell"><span class="sig-num">${i + 1}</span></td>
          <td class="text-center">${escapeHtml(m.account_number)}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Daily Wages Payroll</title>
<style>${DAILY_WAGES_STYLES}</style></head>
<body>
  ${renderDailyWagesHeader(periodHeader, areas)}
  <table class="payroll">
    <colgroup>
      <col style="width:0.4in">
      <col style="width:1.9in">
      <col style="width:0.85in">
      <col style="width:0.55in">
      <col style="width:0.5in">
      <col style="width:0.85in">
      <col style="width:0.6in">
      <col style="width:0.55in">
      <col style="width:0.7in">
      <col style="width:0.85in">
      <col style="width:0.45in">
      <col style="width:0.45in">
      <col style="width:0.85in">
      <col style="width:1.1in">
      <col style="width:1.1in">
    </colgroup>
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
        <th rowspan="3">LANDBANK ATM SAVINGS ACCT. NUMBER</th>
      </tr>
      <tr>
        <th colspan="2">SSS</th>
      </tr>
      <tr>
        <th>SS</th>
        <th>EC</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="subtotal">
        <td></td>
        <td class="text-left">SUB TOTAL</td>
        <td colspan="7"></td>
        <td class="text-right">${fmt(totalGross)}</td>
        <td class="text-right">${showSss ? fmt(totalSs) : ""}</td>
        <td class="text-right">${showSss ? fmt(totalEc) : ""}</td>
        <td class="text-right">${fmt(totalNet)}</td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  ${renderDailyWagesFooter()}
</body></html>`;
}

export function generateJoPayrollPrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(renderDailyWagesPayroll({ ...params, showSss: true }));
}

export function generateJoPayrollNoSssPrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(renderDailyWagesPayroll({ ...params, showSss: false }));
}

// ---------------------------------------------------------------------------
// 3. By-department flat payroll (no rate grouping; primary working list)
// ---------------------------------------------------------------------------

export function generateJoPayrollByDeptPrint({
  rows,
  periodStart,
  periodEnd,
  particulars,
}: GenerateJoPayrollPrintParams): void {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const sorted = [...rows].sort((a, b) => a.fullname.localeCompare(b.fullname));

  let total = 0;
  const rowHtml = sorted
    .map((m, i) => {
      const amount = computeJoGross(m.rate, m.days);
      total += amount;
      return `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${escapeHtml(m.fullname)}</td>
          <td class="text-center">${fmt(m.days)}</td>
          <td class="text-right">${fmt(m.rate)}</td>
          <td class="text-right">${fmt(amount)}</td>
          <td>${escapeHtml(m.account_number)}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>JO Payroll (By Department)</title>
<style>${BASE_STYLES}
@page { size: legal landscape; margin: 0.3in; }
</style></head>
<body>
  <h1 class="title">JOB ORDER PAYROLL</h1>
  <h2 class="subtitle">${periodHeader}</h2>
  ${particulars ? `<h3 class="particulars">${escapeHtml(particulars)}</h3>` : ""}
  <table class="payroll">
    <thead><tr>
      <th style="width:0.4in">#</th>
      <th>Name</th>
      <th style="width:0.9in">Days</th>
      <th style="width:0.9in">Rate</th>
      <th style="width:1.2in">Amount</th>
      <th style="width:1.6in">ATM Account</th>
      <th style="width:1.6in">Signature</th>
    </tr></thead>
    <tbody>
      ${rowHtml}
      <tr class="grand-total">
        <td colspan="4" class="text-right">GRAND TOTAL</td>
        <td class="text-right">${fmt(total)}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>
</body></html>`;

  printHTMLContent(html);
}

// ---------------------------------------------------------------------------
// 4. Summary — paginated 14 rows per page with running totals (legacy behaviour)
// ---------------------------------------------------------------------------

const SUMMARY_ROWS_PER_PAGE = 14;

export function generateJoPayrollSummaryPrint({
  rows,
  periodStart,
  periodEnd,
  particulars,
}: GenerateJoPayrollPrintParams): void {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const groups = groupMembersByRate(rows);

  // Flatten into pages of up to SUMMARY_ROWS_PER_PAGE rows each, then compute
  // a per-page net subtotal — matches the legacy `printSummary` blade.
  const flat = groups.flatMap((g) =>
    [...g.members]
      .sort((a, b) => a.fullname.localeCompare(b.fullname))
      .map((m) => ({ rate: g.rate, member: m })),
  );

  const pages: typeof flat[] = [];
  for (let i = 0; i < flat.length; i += SUMMARY_ROWS_PER_PAGE) {
    pages.push(flat.slice(i, i + SUMMARY_ROWS_PER_PAGE));
  }

  let grandNet = 0;
  const pagesHtml = pages
    .map((page, pi) => {
      let subTotal = 0;
      const rowHtml = page
        .map(({ member: m }, idx) => {
          const net = computeJoNetAmount({
            rate: m.rate,
            days: m.days,
            sss_ss: m.sss_ss,
            sss_ec: m.sss_ec,
          });
          subTotal += net;
          return `
            <tr>
              <td class="text-center">${pi * SUMMARY_ROWS_PER_PAGE + idx + 1}</td>
              <td>${escapeHtml(m.fullname)}</td>
              <td class="text-center">${fmt(m.days)}</td>
              <td class="text-right">${fmt(m.rate)}</td>
              <td class="text-right">${fmt(net)}</td>
            </tr>`;
        })
        .join("");

      grandNet += subTotal;

      return `
        <div class="summary-page" style="page-break-after: ${pi === pages.length - 1 ? "auto" : "always"};">
          <h1 class="title">JOB ORDER PAYROLL — SUMMARY</h1>
          <h2 class="subtitle">${periodHeader}</h2>
          ${particulars ? `<h3 class="particulars">${escapeHtml(particulars)}</h3>` : ""}
          <table class="payroll">
            <thead><tr>
              <th style="width:0.5in">#</th>
              <th>Name</th>
              <th style="width:0.9in">Days</th>
              <th style="width:1in">Rate</th>
              <th style="width:1.4in">Net Amount</th>
            </tr></thead>
            <tbody>
              ${rowHtml}
              <tr class="group-total">
                <td colspan="4" class="text-right">Page sub-total</td>
                <td class="text-right">${fmt(subTotal)}</td>
              </tr>
              ${
                pi === pages.length - 1
                  ? `<tr class="grand-total"><td colspan="4" class="text-right">GRAND TOTAL</td><td class="text-right">${fmt(grandNet)}</td></tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>JO Payroll Summary</title>
<style>${BASE_STYLES}
@page { size: legal portrait; margin: 0.4in; }
.summary-page { padding-bottom: 0.2in; }
</style></head>
<body>${pagesHtml}</body></html>`;

  printHTMLContent(html);
}

// ---------------------------------------------------------------------------
// 5. No-ATM payroll (cash-payable employees only)
// ---------------------------------------------------------------------------

export function generateJoPayrollNoAtmPrint({
  rows,
  periodStart,
  periodEnd,
  particulars,
}: GenerateJoPayrollPrintParams): void {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  // Filter to employees without an ATM account number.
  const subset = rows.filter((m) => !m.account_number?.trim());
  const sorted = [...subset].sort((a, b) => a.fullname.localeCompare(b.fullname));

  let total = 0;
  const rowHtml = sorted
    .map((m, i) => {
      const amount = computeJoGross(m.rate, m.days);
      total += amount;
      return `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${escapeHtml(m.fullname)}</td>
          <td class="text-center">${fmt(m.days)}</td>
          <td class="text-right">${fmt(m.rate)}</td>
          <td class="text-right">${fmt(amount)}</td>
          <td>${escapeHtml(m.tax_number)}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>JO Payroll (No ATM)</title>
<style>${BASE_STYLES}
@page { size: legal landscape; margin: 0.3in; }
</style></head>
<body>
  <h1 class="title">JOB ORDER PAYROLL — CASH PAYABLE</h1>
  <h2 class="subtitle">${periodHeader}</h2>
  ${particulars ? `<h3 class="particulars">${escapeHtml(particulars)}</h3>` : ""}
  <table class="payroll">
    <thead><tr>
      <th style="width:0.4in">#</th>
      <th>Name</th>
      <th style="width:0.9in">Days</th>
      <th style="width:0.9in">Rate</th>
      <th style="width:1.2in">Amount</th>
      <th style="width:1.5in">TIN</th>
      <th style="width:1.6in">Signature</th>
    </tr></thead>
    <tbody>
      ${
        rowHtml ||
        `<tr><td colspan="7" class="text-center">No cash-payable employees in this payroll.</td></tr>`
      }
      <tr class="grand-total">
        <td colspan="4" class="text-right">GRAND TOTAL</td>
        <td class="text-right">${fmt(total)}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>
</body></html>`;

  printHTMLContent(html);
}

// ---------------------------------------------------------------------------
// 6 & 7. Overtime Daily Wages Payroll — with ATM / no ATM (Community Tax)
// ---------------------------------------------------------------------------
// Body shows the OT pay formula expanded: (Rate/Day ÷ 8) × hours = AMOUNT.
// `withAtm = true`  → rightmost column is LANDBANK ATM, all rows shown.
// `withAtm = false` → rightmost columns are Community Tax (Number/Date/Place),
//                     filtered to employees with no ATM account on file.

function renderDailyWagesOvertimePayroll({
  rows,
  periodStart,
  periodEnd,
  areas,
  withAtm,
}: GenerateJoPayrollPrintParams & { withAtm: boolean }): string {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const subset = withAtm
    ? rows
    : rows.filter((m) => !m.account_number?.trim());
  const sorted = [...subset].sort((a, b) =>
    a.fullname.localeCompare(b.fullname),
  );

  let totalAmount = 0;
  let totalNet = 0;

  const bodyRows = sorted
    .map((m, i) => {
      const amount = computeJoOvertimeGross(m.rate, m.hours);
      const net = amount;
      totalAmount += amount;
      totalNet += net;

      const rightCols = withAtm
        ? `<td class="text-center">${escapeHtml(m.account_number)}</td>`
        : `
          <td class="text-center">${escapeHtml(m.tax_number)}</td>
          <td class="text-center">${escapeHtml(m.tax_date)}</td>
          <td class="text-center">${escapeHtml(m.tax_issued)}</td>`;

      return `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td class="text-left">${escapeHtml(m.fullname)}</td>
          <td class="text-center">JOB ORDER</td>
          <td class="text-right">${fmtInt(m.rate)}</td>
          <td class="text-right">${fmt(amount)}</td>
          <td class="text-right">${fmtInt(m.rate)}</td>
          <td class="text-center">8</td>
          <td class="text-center">${(m.hours ?? 0) > 0 ? fmt(m.hours) : ""}</td>
          <td class="text-right">${fmt(net)}</td>
          <td class="signature-cell"><span class="sig-num">${i + 1}</span></td>
          ${rightCols}
        </tr>`;
    })
    .join("");

  // Column counts: 10 left columns (NO..SIGNATURE) + 1 (ATM) or 3 (CT) right.
  const colWidths = withAtm
    ? [
        "0.4in", "1.9in", "0.85in", "0.55in", "0.9in",
        "0.55in", "0.7in", "0.55in", "0.85in", "1in", "1.4in",
      ]
    : [
        "0.4in", "1.7in", "0.85in", "0.5in", "0.85in",
        "0.5in", "0.65in", "0.5in", "0.85in", "0.9in",
        "0.85in", "0.85in", "0.85in",
      ];

  const colgroup = colWidths
    .map((w) => `<col style="width:${w}">`)
    .join("");

  // Right-side header cells
  const rightHeader = withAtm
    ? `<th rowspan="2">LANDBANK ATM SAVINGS ACCT. NUMBER</th>`
    : `<th colspan="3">Community Tax</th>`;
  const rightSubHeader = withAtm
    ? ""
    : `<th>Number</th><th>Date</th><th>Place Issued</th>`;

  // Sub-total row: empty leading cells, AMOUNT total, empty formula cells, NET total, empty right
  const subtotalCells = withAtm
    ? `<td></td><td></td>` // signature + ATM
    : `<td></td><td></td><td></td><td></td>`; // signature + CT (3)

  const emptyBodyMessage = `<tr><td colspan="${colWidths.length}" class="text-center">No ${withAtm ? "" : "cash-payable "}employees in this payroll.</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Daily Wages Payroll — Overtime${withAtm ? "" : " (No ATM)"}</title>
<style>${DAILY_WAGES_STYLES}</style></head>
<body>
  ${renderDailyWagesHeader(periodHeader, areas)}
  <table class="payroll">
    <colgroup>${colgroup}</colgroup>
    <thead>
      <tr>
        <th rowspan="2">NO.</th>
        <th rowspan="2">NAME</th>
        <th rowspan="2">Designation</th>
        <th rowspan="2">Rate Per Day</th>
        <th rowspan="2">AMOUNT ACCURED</th>
        <th colspan="3">OVERTIME PAY FORMULA</th>
        <th rowspan="2">NET PAY</th>
        <th rowspan="2">SIGNATURE</th>
        ${rightHeader}
      </tr>
      <tr>
        <th>RATE/DAY</th>
        <th>CONSTANT FORMULA</th>
        <th>NO. OF HOURS</th>
        ${rightSubHeader}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || emptyBodyMessage}
      <tr class="subtotal">
        <td></td>
        <td class="text-left">SUB TOTAL</td>
        <td colspan="2"></td>
        <td class="text-right">${fmt(totalAmount)}</td>
        <td colspan="3"></td>
        <td class="text-right">${fmt(totalNet)}</td>
        ${subtotalCells}
      </tr>
    </tbody>
  </table>
  ${renderDailyWagesFooter()}
</body></html>`;
}

export function generateJoPayrollOvertimePrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(
    renderDailyWagesOvertimePayroll({ ...params, withAtm: true }),
  );
}

export function generateJoPayrollOvertimeNoAtmPrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(
    renderDailyWagesOvertimePayroll({ ...params, withAtm: false }),
  );
}

// ---------------------------------------------------------------------------
// 8. Summary + overtime — combined paginated summary
// ---------------------------------------------------------------------------

export function generateJoPayrollSummaryOvertimePrint({
  rows,
  periodStart,
  periodEnd,
  particulars,
}: GenerateJoPayrollPrintParams): void {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const sorted = [...rows].sort((a, b) =>
    a.fullname.localeCompare(b.fullname),
  );

  const pages: typeof sorted[] = [];
  for (let i = 0; i < sorted.length; i += SUMMARY_ROWS_PER_PAGE) {
    pages.push(sorted.slice(i, i + SUMMARY_ROWS_PER_PAGE));
  }

  let grandRegular = 0;
  let grandOt = 0;
  const pagesHtml = pages
    .map((page, pi) => {
      let pageReg = 0;
      let pageOt = 0;
      const rowHtml = page
        .map((m, idx) => {
          const reg = computeJoGross(m.rate, m.days);
          const ot = computeJoOvertimeGross(m.rate, m.hours);
          pageReg += reg;
          pageOt += ot;
          return `
            <tr>
              <td class="text-center">${pi * SUMMARY_ROWS_PER_PAGE + idx + 1}</td>
              <td>${escapeHtml(m.fullname)}</td>
              <td class="text-right">${fmt(m.rate)}</td>
              <td class="text-center">${fmt(m.days)}</td>
              <td class="text-center">${fmt(m.hours)}</td>
              <td class="text-right">${fmt(reg)}</td>
              <td class="text-right">${fmt(ot)}</td>
              <td class="text-right">${fmt(reg + ot)}</td>
            </tr>`;
        })
        .join("");
      grandRegular += pageReg;
      grandOt += pageOt;
      return `
        <div class="summary-page" style="page-break-after: ${pi === pages.length - 1 ? "auto" : "always"};">
          <h1 class="title">JOB ORDER PAYROLL — REGULAR + OVERTIME SUMMARY</h1>
          <h2 class="subtitle">${periodHeader}</h2>
          ${particulars ? `<h3 class="particulars">${escapeHtml(particulars)}</h3>` : ""}
          <table class="payroll">
            <thead><tr>
              <th style="width:0.4in">#</th>
              <th>Name</th>
              <th style="width:0.9in">Rate</th>
              <th style="width:0.8in">Days</th>
              <th style="width:0.8in">Hours</th>
              <th style="width:1.1in">Regular</th>
              <th style="width:1.1in">Overtime</th>
              <th style="width:1.2in">Total</th>
            </tr></thead>
            <tbody>
              ${rowHtml}
              <tr class="group-total">
                <td colspan="5" class="text-right">Page sub-total</td>
                <td class="text-right">${fmt(pageReg)}</td>
                <td class="text-right">${fmt(pageOt)}</td>
                <td class="text-right">${fmt(pageReg + pageOt)}</td>
              </tr>
              ${
                pi === pages.length - 1
                  ? `<tr class="grand-total"><td colspan="5" class="text-right">GRAND TOTAL</td><td class="text-right">${fmt(grandRegular)}</td><td class="text-right">${fmt(grandOt)}</td><td class="text-right">${fmt(grandRegular + grandOt)}</td></tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>JO Payroll Summary (with OT)</title>
<style>${BASE_STYLES}
@page { size: legal landscape; margin: 0.3in; }
.summary-page { padding-bottom: 0.2in; }
</style></head>
<body>${pagesHtml}</body></html>`;

  printHTMLContent(html);
}

// ---------------------------------------------------------------------------
// 9. Official Business Request (OBR) — one row per rate, sums net amounts
// ---------------------------------------------------------------------------

interface RenderObrParams {
  rows: JoPayrollPrintRow[];
  periodStart: string;
  periodEnd: string;
  particulars?: string | null;
  description?: string | null;
  overtime?: boolean;
}

function renderObr({
  rows,
  periodStart,
  periodEnd,
  particulars,
  description,
  overtime,
}: RenderObrParams): string {
  const periodHeader = formatPeriodHeader(periodStart, periodEnd);
  const groups = groupMembersByRate(rows);

  let grand = 0;
  const groupRows = groups
    .map((g) => {
      // Pick the alphabetically-first member; legacy code labels the OBR with
      // "<NAME> AND COMPANY" when more than one member shares the rate.
      const firstName = [...g.members]
        .sort((a, b) => a.fullname.localeCompare(b.fullname))[0]?.fullname ?? "";
      const total = overtime
        ? g.members.reduce(
            (s, m) => s + computeJoOvertimeGross(m.rate, m.hours),
            0,
          )
        : g.members.reduce((s, m) => s + computeJoGross(m.rate, m.days), 0);
      grand += total;
      const label =
        g.members.length > 1 ? `${firstName}. AND COMPANY` : firstName;
      return `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td>${escapeHtml(particulars ?? description ?? "")}</td>
          <td class="text-right">${fmt(total)}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>JO ${overtime ? "OT " : ""}OBR</title>
<style>${BASE_STYLES}
@page { size: legal portrait; margin: 0.4in; }
</style></head>
<body>
  <h1 class="title">OBLIGATION REQUEST AND STATUS</h1>
  <h2 class="subtitle">${overtime ? "Overtime · " : ""}${periodHeader}</h2>
  <table class="payroll">
    <thead><tr>
      <th>Payee</th>
      <th>Particulars</th>
      <th style="width:1.5in">Amount</th>
    </tr></thead>
    <tbody>
      ${groupRows || `<tr><td colspan="3" class="text-center">No items.</td></tr>`}
      <tr class="grand-total">
        <td colspan="2" class="text-right">GRAND TOTAL</td>
        <td class="text-right">${fmt(grand)}</td>
      </tr>
    </tbody>
  </table>
</body></html>`;
}

export function generateJoPayrollObrPrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(renderObr({ ...params, overtime: false }));
}

export function generateJoPayrollObrOvertimePrint(
  params: GenerateJoPayrollPrintParams,
): void {
  printHTMLContent(renderObr({ ...params, overtime: true }));
}
