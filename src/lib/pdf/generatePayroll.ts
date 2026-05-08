interface PayrollRow {
  "#": number;
  employeeName: string;
  designation: string;
  monthly_rate: number | null;
  amount_earned: number | null;
  sif: number | null;
  withholding_tax: number | null;
  philhealth_personal_share: number | null;
  philhealth_govt_share: number | null;
  gsis_personal_share: number | null;
  gsis_govt_share: number | null;
  pag_ibig_personal_share: number | null;
  pag_ibig_govt_share: number | null;
  hmdf: number | null;
  pag_ibig_salary_loan: number | null;
  ss_contribution: number | null;
  gsis_repayments_mpl: number | null;
  gsis_repayments_mpl_lite: number | null;
  gsis_repayments_policy_loan: number | null;
  gsis_repayments_cpl: number | null;
  courage_2_contribution: number | null;
  courage_salary_loan: number | null;
  economic_enterprise_multipurpose_coop: number | null;
  eempc_salary_loan: number | null;
  emergency_loan: number | null;
  notice_of_disallowance: number | null;
  amount_received: number | null;
  lbp_savings_account_number: string | null;
}

function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return Number(val).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ROWS_PER_PAGE = 22;
const ROWS_PER_PAGE_2ND_HALF = 17;

function formatPeriodForHeader(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const month = start.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  return `${month} ${startDay}-${endDay}, ${year}`;
}

function sumRows1stHalf(rows: PayrollRow[]) {
  const sum = (v: (number | null | undefined)[]): number =>
    v.reduce<number>((acc, x) => acc + (Number(x) || 0), 0);
  return {
    monthly_rate: sum(rows.map((r) => r.monthly_rate)),
    amount_earned: sum(rows.map((r) => r.amount_earned)),
    sif: sum(rows.map((r) => r.sif)),
    withholding_tax: sum(rows.map((r) => r.withholding_tax)),
    philhealth_personal_share: sum(
      rows.map((r) => r.philhealth_personal_share),
    ),
    philhealth_govt_share: sum(rows.map((r) => r.philhealth_govt_share)),
    gsis_personal_share: sum(rows.map((r) => r.gsis_personal_share)),
    gsis_govt_share: sum(rows.map((r) => r.gsis_govt_share)),
    pag_ibig_personal_share: sum(rows.map((r) => r.pag_ibig_personal_share)),
    pag_ibig_govt_share: sum(rows.map((r) => r.pag_ibig_govt_share)),
    hmdf: sum(rows.map((r) => r.hmdf)),
    pag_ibig_salary_loan: sum(rows.map((r) => r.pag_ibig_salary_loan)),
    ss_contribution: sum(rows.map((r) => r.ss_contribution)),
    gsis_repayments_mpl: sum(rows.map((r) => r.gsis_repayments_mpl)),
    gsis_repayments_mpl_lite: sum(rows.map((r) => r.gsis_repayments_mpl_lite)),
    gsis_repayments_policy_loan: sum(
      rows.map((r) => r.gsis_repayments_policy_loan),
    ),
    gsis_repayments_cpl: sum(rows.map((r) => r.gsis_repayments_cpl)),
    courage_2_contribution: sum(rows.map((r) => r.courage_2_contribution)),
    courage_salary_loan: sum(rows.map((r) => r.courage_salary_loan)),
    economic_enterprise_multipurpose_coop: sum(
      rows.map((r) => r.economic_enterprise_multipurpose_coop),
    ),
    eempc_salary_loan: sum(rows.map((r) => r.eempc_salary_loan)),
    emergency_loan: sum(rows.map((r) => r.emergency_loan)),
    notice_of_disallowance: sum(rows.map((r) => r.notice_of_disallowance)),
    amount_received: sum(rows.map((r) => r.amount_received)),
  };
}

function sumRows2ndHalf(rows: PayrollRow2ndHalf[]) {
  const sum = (v: (number | null | undefined)[]): number =>
    v.reduce<number>((acc, x) => acc + (Number(x) || 0), 0);
  return {
    monthly_rate: sum(rows.map((r) => r.monthly_rate)),
    amount_earned: sum(rows.map((r) => r.amount_earned)),
    amount_received: sum(rows.map((r) => r.amount_received)),
  };
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
          // Ignore
        }
      }
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch {
      // Ignore cleanup errors
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
  if (iframeDoc) {
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
  } else {
    cleanup();
  }
}

export interface GeneratePayrollPrintParams {
  rows: PayrollRow[];
  periodStart: string;
  periodEnd: string;
}

type SumRows1stHalfTotals = ReturnType<typeof sumRows1stHalf>;

function buildSubTotalRow1stHalfMain(totals: SumRows1stHalfTotals) {
  return `
    <tr class="subtotal-row" style="background-color: #f3f4f6; font-weight: bold;">
      <td colspan="3" class="text-right">Sub Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td class="text-right">${formatNum(totals.sif)}</td>
      <td class="text-right">${formatNum(totals.withholding_tax)}</td>
      <td class="text-right">${formatNum(totals.philhealth_personal_share)}</td>
      <td class="text-right">${formatNum(totals.philhealth_govt_share)}</td>
      <td class="text-right">${formatNum(totals.gsis_personal_share)}</td>
      <td class="text-right">${formatNum(totals.gsis_govt_share)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_personal_share)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_govt_share)}</td>
      <td class="text-right">${formatNum(totals.hmdf)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.ss_contribution)}</td>
    </tr>`;
}

function buildSubTotalRow1stHalfContinuation(totals: SumRows1stHalfTotals) {
  return `
    <tr class="subtotal-row" style="background-color: #f3f4f6; font-weight: bold;">
      <td class="text-right">${formatNum(totals.gsis_repayments_mpl)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_mpl_lite)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_policy_loan)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_cpl)}</td>
      <td class="text-right">${formatNum(totals.emergency_loan)}</td>
      <td class="text-right">${formatNum(totals.courage_2_contribution)}</td>
      <td class="text-right">${formatNum(totals.courage_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.economic_enterprise_multipurpose_coop)}</td>
      <td class="text-right">${formatNum(totals.eempc_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.notice_of_disallowance)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

function buildGrandTotalRow1stHalfMain(totals: SumRows1stHalfTotals) {
  return `
    <tr class="grandtotal-row" style="background-color: #e5e7eb; font-weight: bold;">
      <td colspan="3" class="text-right">Grand Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td class="text-right">${formatNum(totals.sif)}</td>
      <td class="text-right">${formatNum(totals.withholding_tax)}</td>
      <td class="text-right">${formatNum(totals.philhealth_personal_share)}</td>
      <td class="text-right">${formatNum(totals.philhealth_govt_share)}</td>
      <td class="text-right">${formatNum(totals.gsis_personal_share)}</td>
      <td class="text-right">${formatNum(totals.gsis_govt_share)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_personal_share)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_govt_share)}</td>
      <td class="text-right">${formatNum(totals.hmdf)}</td>
      <td class="text-right">${formatNum(totals.pag_ibig_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.ss_contribution)}</td>
    </tr>`;
}

function buildGrandTotalRow1stHalfContinuation(totals: SumRows1stHalfTotals) {
  return `
    <tr class="grandtotal-row" style="background-color: #e5e7eb; font-weight: bold;">
      <td class="text-right">${formatNum(totals.gsis_repayments_mpl)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_mpl_lite)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_policy_loan)}</td>
      <td class="text-right">${formatNum(totals.gsis_repayments_cpl)}</td>
      <td class="text-right">${formatNum(totals.emergency_loan)}</td>
      <td class="text-right">${formatNum(totals.courage_2_contribution)}</td>
      <td class="text-right">${formatNum(totals.courage_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.economic_enterprise_multipurpose_coop)}</td>
      <td class="text-right">${formatNum(totals.eempc_salary_loan)}</td>
      <td class="text-right">${formatNum(totals.notice_of_disallowance)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

export function generatePayrollPrint({
  rows,
  periodStart,
  periodEnd,
}: GeneratePayrollPrintParams): void {
  if (rows.length === 0) return;

  const cityMayorName = process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "";
  const cityMayorPosition = process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "";
  const cityTreasurerName = process.env.NEXT_PUBLIC_CITY_TREASURER_NAME ?? "";
  const cityTreasurerPosition =
    process.env.NEXT_PUBLIC_CITY_TREASURER_POSITION ?? "";
  const cityAdministratorName =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_NAME ?? "";
  const cityAdministratorPosition =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_POSITION ?? "";

  const periodLabel = formatPeriodForHeader(periodStart, periodEnd);
  const cityAccountantName =
    process.env.NEXT_PUBLIC_CITY_ACCOUNTANT_NAME ??
    "Easy Xaflavaire Hope E. Dimal";
  const cityAccountantPosition = "City Accountant";

  const headerRowsMain = `
      <tr class="payroll-header-row">
        <th colspan="16" class="payroll-header-center">OFFICE OF THE CITY MAYOR - PAYROLL</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="16" class="payroll-header-center">LGU - OZAMIZ CITY</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="16" class="payroll-header-period">${periodLabel} PERIOD</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="16" style="border: none; background: none; padding: 4px 0;">
          <div class="payroll-header-bottom">
            <div class="payroll-acknowledgement">We Acknowledge receipt of the sum shown opposite our names as full compensation for services rendered for the period stated:</div>
            <div class="payroll-accountant">
              <div class="name">&nbsp;</div>
              <div class="position">&nbsp;</div>
            </div>
          </div>
        </th>
      </tr>
`;

  const headerRowsContinuation = `
      <tr class="payroll-header-row payroll-header-invisible">
        <th colspan="14" class="payroll-header-center">&nbsp;</th>
      </tr>
      <tr class="payroll-header-row payroll-header-invisible">
        <th colspan="14" class="payroll-header-center">&nbsp;</th>
      </tr>
      <tr class="payroll-header-row payroll-header-invisible">
        <th colspan="14" class="payroll-header-period">&nbsp;</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="14" style="border: none; background: none; padding: 4px 0;">
          <div class="payroll-continuation-accountant-center">
            <div class="payroll-accountant">
              <div class="name">${cityAccountantName}</div>
              <div class="position">${cityAccountantPosition}</div>
            </div>
          </div>
        </th>
      </tr>
`;

  const grandTotals = sumRows1stHalf(rows);
  const pages: PayrollRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }

  const signatoriesTfootMain = `
    <tfoot>
      <tr>
        <td colspan="16" style="border: none; vertical-align: top;">
          <div class="signatories-row signatories-main" aria-label="Approved by">
            <div class="signatory">
              <div class="certification">CERTIFIED: Service have been duly rendered as stated:</div>
              <div class="name">${cityMayorName}</div>
              <div class="position">${cityMayorPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Funds available in the amount of P</div>
              <div class="name">${cityTreasurerName}</div>
              <div class="position">${cityTreasurerPosition}</div>
            </div>
          </div>
        </td>
      </tr>
    </tfoot>`;

  const signatoriesTfootContinuation = `
    <tfoot>
      <tr>
        <td colspan="14" style="border: none; vertical-align: top;">
          <div class="signatories-row signatories-continuation" aria-label="Approved by">
            <div class="signatory">
              <div class="certification">CERTIFIED: Each employee whose name appears above has been paid the amount indicated opposite his/her name.</div>
              <div class="name">${cityAdministratorName}</div>
              <div class="position">${cityAdministratorPosition}</div>
            </div>
          </div>
        </td>
      </tr>
    </tfoot>`;

  const pageTables: string[] = [];
  let rowIndex = 0;
  for (let p = 0; p < pages.length; p++) {
    const pageRows = pages[p];
    const isLastPage = p === pages.length - 1;
    const rowPartsMain: string[] = [];
    const rowPartsContinuation: string[] = [];
    for (const r of pageRows) {
      rowIndex += 1;
      rowPartsMain.push(`
    <tr>
      <td class="text-center">${rowIndex}</td>
      <td>${r.employeeName ?? ""}</td>
      <td>${r.designation ?? ""}</td>
      <td class="text-right">${formatNum(r.monthly_rate)}</td>
      <td class="text-right">${formatNum(r.amount_earned)}</td>
      <td class="text-right">${formatNum(r.sif)}</td>
      <td class="text-right">${formatNum(r.withholding_tax)}</td>
      <td class="text-right">${formatNum(r.philhealth_personal_share)}</td>
      <td class="text-right">${formatNum(r.philhealth_govt_share)}</td>
      <td class="text-right">${formatNum(r.gsis_personal_share)}</td>
      <td class="text-right">${formatNum(r.gsis_govt_share)}</td>
      <td class="text-right">${formatNum(r.pag_ibig_personal_share)}</td>
      <td class="text-right">${formatNum(r.pag_ibig_govt_share)}</td>
      <td class="text-right">${formatNum(r.hmdf)}</td>
      <td class="text-right">${formatNum(r.pag_ibig_salary_loan)}</td>
      <td class="text-right">${formatNum(r.ss_contribution)}</td>
    </tr>
  `);
      rowPartsContinuation.push(`
    <tr>
      <td class="text-right">${formatNum(r.gsis_repayments_mpl)}</td>
      <td class="text-right">${formatNum(r.gsis_repayments_mpl_lite)}</td>
      <td class="text-right">${formatNum(r.gsis_repayments_policy_loan)}</td>
      <td class="text-right">${formatNum(r.gsis_repayments_cpl)}</td>
      <td class="text-right">${formatNum(r.emergency_loan)}</td>
      <td class="text-right">${formatNum(r.courage_2_contribution)}</td>
      <td class="text-right">${formatNum(r.courage_salary_loan)}</td>
      <td class="text-right">${formatNum(r.economic_enterprise_multipurpose_coop)}</td>
      <td class="text-right">${formatNum(r.eempc_salary_loan)}</td>
      <td class="text-right">${formatNum(r.notice_of_disallowance)}</td>
      <td class="text-center">${rowIndex}</td>
      <td class="text-right">${formatNum(r.amount_received)}</td>
      <td style="width: 120px;"></td>
      <td class="text-center">${r.lbp_savings_account_number || ""}</td>
    </tr>
  `);
    }
    const pageTotals = sumRows1stHalf(pageRows);
    rowPartsMain.push(buildSubTotalRow1stHalfMain(pageTotals));
    rowPartsContinuation.push(buildSubTotalRow1stHalfContinuation(pageTotals));
    if (isLastPage) {
      rowPartsMain.push(buildGrandTotalRow1stHalfMain(grandTotals));
      rowPartsContinuation.push(
        buildGrandTotalRow1stHalfContinuation(grandTotals),
      );
    }
    pageTables.push(`
  <div class="payroll-page" style="page-break-after: always;">
    <table class="payroll-1st-main">
      <thead>${headerRowsMain}
      <tr>
        <th style="width: 25px;">#</th>
        <th style="min-width: 150px;">Employee Name</th>
        <th style="min-width: 100px;">Designation</th>
        <th style="width: 55px;">Monthly Rate</th>
        <th style="width: 55px;">Amount Earned</th>
        <th style="width: 40px;">SIF</th>
        <th style="width: 55px;">Withholding Tax</th>
        <th colspan="2" style="width: 90px;">PhilHealth</th>
        <th colspan="2" style="width: 90px; font-size: 6pt;">GSIS
        <br/>LIFE and RETIREMENT
        <br/>GSIS - Insurance Premium</th>
        <th colspan="2" style="width: 90px; font-size: 6pt;">PAG-IBIG
        <br/>HMDF</th>
        <th style="width: 45px;">HDMF
        <br/>"2"<br/>Prem.</th>
        <th style="width: 55px;">PAG-IBIG Salary Loan</th>
        <th style="width: 50px;">SS Contribution</th>
      </tr>
      <tr>
        <th></th><th></th><th></th><th></th><th></th><th></th><th></th>
        <th style="width:45px;font-size:6pt;">Personal</th>
        <th style="width:45px;font-size:6pt;">Gov't</th>
        <th style="width:45px;font-size:6pt;">Personal</th>
        <th style="width:45px;font-size:6pt;">Gov't</th>
        <th style="width:45px;font-size:6pt;">Personal</th>
        <th style="width:45px;font-size:6pt;">Gov't</th>
        <th></th><th></th><th></th>
      </tr>
    </thead>
    <tbody>${rowPartsMain.join("")}</tbody>${signatoriesTfootMain}
    </table>
  </div>`);
    pageTables.push(`
  <div class="payroll-page payroll-page-continuation" style="page-break-after: ${isLastPage ? "auto" : "always"};">
    <table class="payroll-1st-continuation">
      <thead>${headerRowsContinuation}
      <tr>
        <th colspan="9">Deductions</th>
        <th rowspan="2" style="width: 55px;">Notice of<br/>Disallowance<br/>No. 2022-<br/>001-(2020)</th>
        <th rowspan="2" style="width: 25px;">No.</th>
        <th rowspan="2" style="width: 80px;">Amount Received</th>
        <th rowspan="2" style="width: 160px;">Signature</th>
        <th rowspan="2" style="width: 80px;">LBP Acct No</th>
      </tr>
      <tr>
        <th style="width:32px;font-size:6pt;">MPL</th>
        <th style="width:32px;font-size:6pt;">MPL-LITE</th>
        <th style="width:32px;font-size:6pt;">Policy<br/>Loan</th>
        <th style="width:32px;font-size:6pt;">CPL</th>
        <th style="width: 80px;">Emergency<br/>Loan</th>
        <th style="width:45px;font-size:5pt;">COURAGE 2 Contrib</th>
        <th style="width:45px;font-size:6pt;">Salary Loan</th>
        <th style="width: 55px;">EEMPC</th>
        <th style="width: 80px;">EEMPC<br/>Salary Loan</th>
      </tr>
    </thead>
    <tbody>${rowPartsContinuation.join("")}</tbody>${signatoriesTfootContinuation}
    </table>
  </div>`);
  }

  const landscapeStyles = `
    :root {
      --payroll-row-height: 18px;
    }
    @page {
      size: 13in 8.5in landscape;
      margin-top: 0.2in;
      margin-bottom: 1in;
      margin-left: 0.3in;
      margin-right: 0.3in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.1; color: #000; background: #fff; }
    table { width: 100%; border-collapse: collapse; }
    table.payroll-1st-main { table-layout: auto; }
    table.payroll-1st-continuation { table-layout: auto; }
    .payroll-page-continuation { margin-left: 1in; }
    table tbody tr { page-break-inside: avoid; height: var(--payroll-row-height); }
    table tbody tr.subtotal-row,
    table tbody tr.grandtotal-row { height: var(--payroll-row-height); }
    table tfoot { page-break-inside: avoid; }
    table th, table td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
    table th { background-color: #e5e7eb; font-weight: bold; text-align: center; font-size: 7pt; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .signatory { text-align: center; min-width: 0; font-size: 8pt; }
    .signatory .certification { font-size: 6pt; margin-bottom: 0.35in; max-width: 1.8in; line-height: 1.2; }
    .signatory .name { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; display: inline-block; min-width: 1.5in; }
    .signatory .position { font-size: 7pt; margin-top: 2px; }
    tfoot .signatories-row { display: flex; justify-content: space-between; padding: 0.2in 1in; }
    tfoot .signatories-continuation { justify-content: flex-end; }
    .payroll-header-row { border: none; }
    .payroll-header-row th { border: none; background: none; font-weight: bold; }
    .payroll-header-invisible th,
    .payroll-header-invisible .payroll-acknowledgement,
    .payroll-header-invisible .name,
    .payroll-header-invisible .position { color: white; }
    .payroll-header-center { text-align: center; font-size: 12pt; }
    .payroll-header-period { text-align: center; font-size: 10pt; }
    .payroll-header-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 1in; }
    .payroll-acknowledgement { font-size: 6pt; max-width: 4in; text-align: left; }
    .payroll-accountant { text-align: right; }
    .payroll-accountant .name { font-size: 8pt; }
    .payroll-accountant .position { font-size: 7pt; font-style: italic; }
    .payroll-continuation-accountant-center { display: flex; justify-content: center; }
    .payroll-continuation-accountant-center .payroll-accountant { text-align: center; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payroll</title>
  <style>${landscapeStyles}</style>
</head>
<body>
${pageTables.join("")}
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

function buildSubTotalRow2ndHalf(
  totals: ReturnType<typeof sumRows2ndHalf>,
): string {
  return `
    <tr class="subtotal-row" style="background-color: #f3f4f6; font-weight: bold;">
      <td colspan="3" class="text-right">Sub Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

function buildGrandTotalRow2ndHalf(
  totals: ReturnType<typeof sumRows2ndHalf>,
): string {
  return `
    <tr class="grandtotal-row" style="background-color: #e5e7eb; font-weight: bold;">
      <td colspan="3" class="text-right">Grand Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

// 2nd Half: simplified columns - #, Employee Name, Designation, Monthly Rate, Amount Earned, No., Net Amount Received, Signature of Payee, LBP Savings Account Number
export interface PayrollRow2ndHalf {
  "#": number;
  employeeName: string;
  designation: string;
  monthly_rate: number | null;
  amount_earned: number | null;
  amount_received: number | null;
  lbp_savings_account_number: string | null;
}

export interface GeneratePayrollPrint2ndHalfParams {
  rows: PayrollRow2ndHalf[];
  periodStart: string;
  periodEnd: string;
}

export function generatePayrollPrint2ndHalf({
  rows,
  periodStart,
  periodEnd,
}: GeneratePayrollPrint2ndHalfParams): void {
  if (rows.length === 0) return;

  const cityMayorName = process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "";
  const cityMayorPosition = process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "";
  const cityTreasurerName = process.env.NEXT_PUBLIC_CITY_TREASURER_NAME ?? "";
  const cityTreasurerPosition =
    process.env.NEXT_PUBLIC_CITY_TREASURER_POSITION ?? "";
  const cityAdministratorName =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_NAME ?? "";
  const cityAdministratorPosition =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_POSITION ?? "";

  const periodLabel = formatPeriodForHeader(periodStart, periodEnd);
  const cityAccountantName =
    process.env.NEXT_PUBLIC_CITY_ACCOUNTANT_NAME ??
    "Easy Xaflavaire Hope E. Dimal";
  const cityAccountantPosition = "City Accountant";

  const headerRows2ndHalf = `
      <tr class="payroll-header-row">
        <th colspan="9" class="payroll-header-center">OFFICE OF THE CITY MAYOR - PAYROLL</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="9" class="payroll-header-center">LGU - OZAMIZ CITY</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="9" class="payroll-header-period">${periodLabel} PERIOD</th>
      </tr>
      <tr class="payroll-header-row">
        <th colspan="9" style="border: none; background: none; padding: 4px 0;">
          <div class="payroll-header-bottom">
            <div class="payroll-acknowledgement">We Acknowledge receipt of the sum shown opposite our names as full compensation for services rendered for the period stated:</div>
            <div class="payroll-accountant">
              <div class="name">${cityAccountantName}</div>
              <div class="position">${cityAccountantPosition}</div>
            </div>
          </div>
        </th>
      </tr>
`;

  const grandTotals = sumRows2ndHalf(rows);
  const pages: PayrollRow2ndHalf[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE_2ND_HALF) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE_2ND_HALF));
  }

  const pageTables: string[] = [];
  let rowIndex = 0;
  for (let p = 0; p < pages.length; p++) {
    const pageRows = pages[p];
    const isLastPage = p === pages.length - 1;
    const rowParts: string[] = [];
    for (const r of pageRows) {
      rowIndex += 1;
      rowParts.push(`
    <tr>
      <td class="text-center">${rowIndex}</td>
      <td>${r.employeeName}</td>
      <td>${r.designation}</td>
      <td class="text-right">${formatNum(r.monthly_rate)}</td>
      <td class="text-right">${formatNum(r.amount_earned)}</td>
      <td class="text-center">${rowIndex}</td>
      <td class="text-right">${formatNum(r.amount_received)}</td>
      <td class="text-center" style="width: 120px;"></td>
      <td class="text-center">${r.lbp_savings_account_number || ""}</td>
    </tr>
  `);
    }
    const pageTotals = sumRows2ndHalf(pageRows);
    rowParts.push(buildSubTotalRow2ndHalf(pageTotals));
    if (isLastPage) {
      rowParts.push(buildGrandTotalRow2ndHalf(grandTotals));
    }
    const signatoriesTfoot2ndHalf = `
    <tfoot>
      <tr>
        <td colspan="9" style="border: none; vertical-align: top;">
          <div class="signatories-row signatories-three-cols" aria-label="Approved by">
            <div class="signatory">
              <div class="certification">CERTIFIED: Service have been duly rendered as stated:</div>
              <div class="name">${cityMayorName}</div>
              <div class="position">${cityMayorPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Funds available in the amount of P</div>
              <div class="name">${cityTreasurerName}</div>
              <div class="position">${cityTreasurerPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Each employee whose name appears above has been paid the amount indicated opposite his/her name.</div>
              <div class="name">${cityAdministratorName}</div>
              <div class="position">${cityAdministratorPosition}</div>
            </div>
          </div>
        </td>
      </tr>
    </tfoot>`;
    pageTables.push(`
  <div class="payroll-page" style="page-break-after: ${isLastPage ? "auto" : "always"};">
    <table>
      <thead>${headerRows2ndHalf}
      <tr>
        <th style="width: 25px;">#</th>
        <th style="min-width: 120px;">Employee Name</th>
        <th style="min-width: 80px;">Designation</th>
        <th style="width: 55px;">Monthly Rate</th>
        <th style="width: 55px;">Amount Earned</th>
        <th style="width: 25px;">No.</th>
        <th style="width: 55px;">Net Amount Received</th>
        <th style="width: 140px; min-width: 120px;">Signature of Payee</th>
        <th style="width: 100px;">LBP Savings Account Number</th>
      </tr>
    </thead>
    <tbody>${rowParts.join("")}</tbody>${signatoriesTfoot2ndHalf}
    </table>
  </div>`);
  }

  const landscapeStyles2ndHalf = `
    @page {
      size: 17in 11in landscape;
      margin-top: 0.2in;
      margin-bottom: 0.3in;
      margin-left: 0.3in;
      margin-right: 0.3in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.2; color: #000; background: #fff; }
    table { width: 100%; border-collapse: collapse; }
    table tbody tr { page-break-inside: avoid; }
    table tfoot { page-break-inside: avoid; }
    table th, table td { border: 1px solid #000; padding: 5px 3px; vertical-align: middle; }
    table th { background-color: #e5e7eb; font-weight: bold; text-align: center; font-size: 7pt; line-height: 1.2; padding: 5px 2px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .signatory { text-align: center; min-width: 0; font-size: 8pt; }
    .signatory .certification { font-size: 6pt; margin-bottom: 0.35in; max-width: 1.8in; line-height: 1.2; }
    .signatory .name { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; display: inline-block; min-width: 1.5in; }
    .signatory .position { font-size: 7pt; margin-top: 2px; }
    tfoot .signatories-row { display: flex; justify-content: space-between; padding: 0.2in 1in; }
    tfoot .signatories-three-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1in; padding: 0.2in 1in; }
    tfoot .signatories-continuation { justify-content: flex-end; }
    .payroll-header-row { border: none; }
    .payroll-header-row th { border: none; background: none; font-weight: bold; }
    .payroll-header-invisible th,
    .payroll-header-invisible .payroll-acknowledgement,
    .payroll-header-invisible .name,
    .payroll-header-invisible .position { color: white; }
    .payroll-header-center { text-align: center; font-size: 12pt; }
    .payroll-header-period { text-align: center; font-size: 10pt; }
    .payroll-header-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 1in; }
    .payroll-acknowledgement { font-size: 6pt; max-width: 4in; text-align: left; }
    .payroll-accountant { text-align: right; }
    .payroll-accountant .name { font-size: 8pt; }
    .payroll-accountant .position { font-size: 7pt; font-style: italic; }
    .payroll-continuation-accountant-center { display: flex; justify-content: center; }
    .payroll-continuation-accountant-center .payroll-accountant { text-align: center; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payroll (2nd Half)</title>
  <style>${landscapeStyles2ndHalf}</style>
</head>
<body>
${pageTables.join("")}
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

/** PERA payroll: single-table layout, same header/footer style as salary payroll. */
export interface PayrollPeraRow {
  employeeName: string;
  cmoIdNo: string;
  designation: string;
  monthly_rate: number | null;
  /** Base PERA (NEXT_PUBLIC_PERA_MONTHLY_AMOUNT), same per row for display */
  amount_earned: number;
  economic_enterprise_multipurpose_coop_pera: number | null;
  courage_2_pera_loan: number | null;
  net_amount_received: number;
  lbp_savings_account_number: string | null;
}

export interface GeneratePayrollPeraPrintParams {
  rows: PayrollPeraRow[];
  periodStart: string;
  periodEnd: string;
}

function sumRowsPera(rows: PayrollPeraRow[]) {
  const sum = (v: (number | null | undefined)[]): number =>
    v.reduce<number>((acc, x) => acc + (Number(x) || 0), 0);
  return {
    monthly_rate: sum(rows.map((r) => r.monthly_rate)),
    amount_earned: sum(rows.map((r) => r.amount_earned)),
    economic_enterprise_multipurpose_coop_pera: sum(
      rows.map((r) => r.economic_enterprise_multipurpose_coop_pera),
    ),
    courage_2_pera_loan: sum(rows.map((r) => r.courage_2_pera_loan)),
    net_amount_received: sum(rows.map((r) => r.net_amount_received)),
  };
}

type SumRowsPeraTotals = ReturnType<typeof sumRowsPera>;

function buildSubTotalRowPera(totals: SumRowsPeraTotals): string {
  return `
    <tr class="subtotal-row" style="background-color: #f3f4f6; font-weight: bold;">
      <td colspan="4" class="text-right">Sub Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td class="text-right">${formatNum(totals.economic_enterprise_multipurpose_coop_pera)}</td>
      <td class="text-right">${formatNum(totals.courage_2_pera_loan)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.net_amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

function buildGrandTotalRowPera(totals: SumRowsPeraTotals): string {
  return `
    <tr class="grandtotal-row" style="background-color: #e5e7eb; font-weight: bold;">
      <td colspan="4" class="text-right">Grand Total</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.amount_earned)}</td>
      <td class="text-right">${formatNum(totals.economic_enterprise_multipurpose_coop_pera)}</td>
      <td class="text-right">${formatNum(totals.courage_2_pera_loan)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.net_amount_received)}</td>
      <td></td>
      <td></td>
    </tr>`;
}

const ROWS_PER_PAGE_PERA = 17;

export function generatePayrollPeraPrint({
  rows,
  periodStart,
  periodEnd,
}: GeneratePayrollPeraPrintParams): void {
  if (rows.length === 0) return;

  const cityMayorName = process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "";
  const cityMayorPosition = process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "";
  const cityTreasurerName = process.env.NEXT_PUBLIC_CITY_TREASURER_NAME ?? "";
  const cityTreasurerPosition =
    process.env.NEXT_PUBLIC_CITY_TREASURER_POSITION ?? "";
  const cityAdministratorName =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_NAME ?? "";
  const cityAdministratorPosition =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_POSITION ?? "";

  const periodLabel = formatPeriodForHeader(periodStart, periodEnd);
  const peraTitleLine = `PERA - ${periodLabel}`;
  const cityAccountantName =
    process.env.NEXT_PUBLIC_CITY_ACCOUNTANT_NAME ??
    "Easy Xaflavaire Hope E. Dimal";
  const cityAccountantPosition = "City Accountant";

  const headerRowsPera = `
      <tr class="payroll-header-row payroll-pera-header-title">
        <th colspan="12" class="payroll-header-center">OFFICE OF THE CITY MAYOR - PAYROLL</th>
      </tr>
      <tr class="payroll-header-row payroll-pera-header-title">
        <th colspan="12" class="payroll-header-center">LGU - OZAMIZ CITY</th>
      </tr>
      <tr class="payroll-header-row payroll-pera-header-title">
        <th colspan="12" class="payroll-pera-title-main">${peraTitleLine}</th>
      </tr>
      <tr class="payroll-header-row payroll-pera-header-title">
        <th colspan="12" class="payroll-pera-title-period">PERIOD</th>
      </tr>
      <tr class="payroll-header-row payroll-pera-ack-header">
        <th colspan="12" class="payroll-pera-ack-cell">
          <div class="payroll-header-bottom">
            <div class="payroll-acknowledgement">We Acknowledge receipt of the sum shown opposite our names as full compensation for services rendered for the period stated:</div>
            <div class="payroll-accountant">
              <div class="name">${cityAccountantName}</div>
              <div class="position">${cityAccountantPosition}</div>
            </div>
          </div>
        </th>
      </tr>
`;

  const grandTotals = sumRowsPera(rows);
  const pages: PayrollPeraRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE_PERA) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE_PERA));
  }

  const pageTables: string[] = [];
  let rowIndex = 0;
  for (let p = 0; p < pages.length; p++) {
    const pageRows = pages[p];
    const isLastPage = p === pages.length - 1;
    const rowParts: string[] = [];
    for (const r of pageRows) {
      rowIndex += 1;
      rowParts.push(`
    <tr>
      <td class="text-center payroll-pera-col-no">${rowIndex}</td>
      <td class="payroll-pera-cell-name">${r.employeeName}</td>
      <td class="text-center payroll-pera-cell-cmo">${r.cmoIdNo}</td>
      <td class="payroll-pera-cell-designation">${r.designation}</td>
      <td class="text-right">${formatNum(r.monthly_rate)}</td>
      <td class="text-right">${formatNum(r.amount_earned)}</td>
      <td class="text-right">${formatNum(r.economic_enterprise_multipurpose_coop_pera)}</td>
      <td class="text-right">${formatNum(r.courage_2_pera_loan)}</td>
      <td class="text-center payroll-pera-col-no">${rowIndex}</td>
      <td class="text-right">${formatNum(r.net_amount_received)}</td>
      <td class="text-center payroll-pera-cell-signature"></td>
      <td class="text-center payroll-pera-cell-lbp">${r.lbp_savings_account_number || ""}</td>
    </tr>
  `);
    }
    const pageTotals = sumRowsPera(pageRows);
    rowParts.push(buildSubTotalRowPera(pageTotals));
    if (isLastPage) {
      rowParts.push(buildGrandTotalRowPera(grandTotals));
    }
    const signatoriesTfootPera = `
    <tfoot>
      <tr>
        <td colspan="12" style="border: none; vertical-align: top;">
          <div class="signatories-row signatories-three-cols" aria-label="Approved by">
            <div class="signatory">
              <div class="certification">CERTIFIED: Service have been duly rendered as stated:</div>
              <div class="name">${cityMayorName}</div>
              <div class="position">${cityMayorPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Funds available in the amount of P</div>
              <div class="name">${cityTreasurerName}</div>
              <div class="position">${cityTreasurerPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Each employee whose name appears above has been paid the amount indicated opposite his/her name.</div>
              <div class="name">${cityAdministratorName}</div>
              <div class="position">${cityAdministratorPosition}</div>
            </div>
          </div>
        </td>
      </tr>
    </tfoot>`;
    pageTables.push(`
  <div class="payroll-page" style="page-break-after: ${isLastPage ? "auto" : "always"};">
    <table class="payroll-pera-table">
      <thead>${headerRowsPera}
      <tr>
        <th class="payroll-pera-th payroll-pera-th-no">No.</th>
        <th class="payroll-pera-th payroll-pera-th-name">Employee<br/>Name<br/>&nbsp;</th>
        <th class="payroll-pera-th payroll-pera-th-cmo">CMO ID<br/>No.<br/>&nbsp;</th>
        <th class="payroll-pera-th payroll-pera-th-designation">Designation<br/>&nbsp;<br/>&nbsp;</th>
        <th class="payroll-pera-th payroll-pera-th-compact-num">Monthly<br/>Rate of<br/>Pay</th>
        <th class="payroll-pera-th payroll-pera-th-compact-num">Amount<br/>Earned<br/>&nbsp;</th>
        <th class="payroll-pera-th payroll-pera-th-eempc">ECONOMIC<br/>ENTERPRISE<br/>MULTIPURPOSE COOP</th>
        <th class="payroll-pera-th payroll-pera-th-compact-num">COURAGE-2<br/>PERA<br/>LOAN</th>
        <th class="payroll-pera-th payroll-pera-th-no">No.</th>
        <th class="payroll-pera-th payroll-pera-th-compact-num">Net Amount<br/>Received<br/>&nbsp;</th>
        <th class="payroll-pera-th payroll-pera-th-signature">SIGNATURE<br/>OF<br/>PAYEE</th>
        <th class="payroll-pera-th payroll-pera-th-lbp">LBP Savings<br/>Account<br/>Number</th>
      </tr>
    </thead>
    <tbody>${rowParts.join("")}</tbody>${signatoriesTfootPera}
    </table>
  </div>`);
  }

  const landscapeStylesPera = `
    @page {
      size: 17in 11in landscape;
      margin-top: 0.2in;
      margin-bottom: 0.3in;
      margin-left: 0.3in;
      margin-right: 0.3in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.2; color: #000; background: #fff; }
    table.payroll-pera-table { width: 100%; border-collapse: collapse; table-layout: auto; }
    table.payroll-pera-table tbody tr { page-break-inside: avoid; }
    table.payroll-pera-table tfoot { page-break-inside: avoid; }
    table.payroll-pera-table th, table.payroll-pera-table td { border: 1px solid #000; padding: 5px 3px; vertical-align: middle; }
    table.payroll-pera-table thead tr.payroll-header-row th,
    table.payroll-pera-table thead tr.payroll-pera-ack-header th.payroll-pera-ack-cell {
      border: none !important;
      background: none !important;
    }
    .payroll-pera-title-main {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      padding: 4px 0 2px !important;
    }
    .payroll-pera-title-period {
      text-align: center;
      font-size: 10pt;
      font-weight: bold;
      padding: 0 0 6px !important;
    }
    .payroll-pera-ack-cell { padding: 4px 0 !important; }
    table.payroll-pera-table thead th.payroll-header-center {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      padding: 2px 0 !important;
    }
    table.payroll-pera-table th.payroll-pera-th { background-color: #e5e7eb; font-weight: bold; text-align: center; font-size: 7pt; line-height: 1.2; padding: 5px 2px; }
    table.payroll-pera-table thead th.payroll-pera-th-no,
    table.payroll-pera-table tbody td.payroll-pera-col-no {
      width: 0.01%;
      padding: 5px 2px;
      white-space: nowrap;
    }
    table.payroll-pera-table th.payroll-pera-th-name,
    table.payroll-pera-table td.payroll-pera-cell-name {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-pera-table th.payroll-pera-th-cmo,
    table.payroll-pera-table td.payroll-pera-cell-cmo {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-pera-table thead th.payroll-pera-th-designation,
    table.payroll-pera-table tbody td.payroll-pera-cell-designation {
      min-width: 12em;
      white-space: nowrap;
      width: auto;
    }
    table.payroll-pera-table thead th.payroll-pera-th-compact-num,
    table.payroll-pera-table thead th.payroll-pera-th-eempc {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-pera-table tbody td.text-right {
      white-space: nowrap;
    }
    table.payroll-pera-table thead th.payroll-pera-th-signature,
    table.payroll-pera-table tbody td.payroll-pera-cell-signature {
      min-width: 1.35in;
      width: 1.5in;
      box-sizing: border-box;
    }
    table.payroll-pera-table thead th.payroll-pera-th-lbp,
    table.payroll-pera-table tbody td.payroll-pera-cell-lbp {
      white-space: nowrap;
      width: auto;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .signatory { text-align: center; min-width: 0; font-size: 8pt; }
    .signatory .certification { font-size: 6pt; margin-bottom: 0.35in; max-width: 1.8in; line-height: 1.2; }
    .signatory .name { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; display: inline-block; min-width: 1.5in; }
    .signatory .position { font-size: 7pt; margin-top: 2px; }
    tfoot .signatories-row { display: flex; justify-content: space-between; padding: 0.2in 1in; }
    tfoot .signatories-three-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1in; padding: 0.2in 1in; }
    .payroll-header-row { border: none; }
    .payroll-header-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 1in; }
    .payroll-acknowledgement { font-size: 6pt; max-width: 4in; text-align: left; }
    .payroll-accountant { text-align: right; }
    .payroll-accountant .name { font-size: 8pt; }
    .payroll-accountant .position { font-size: 7pt; font-style: italic; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payroll (PERA)</title>
  <style>${landscapeStylesPera}</style>
</head>
<body>
${pageTables.join("")}
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

// Remittance List - same header/logos as OBR
export interface RemittanceListRow {
  employeeName: string;
  lbp_savings_account_number: string | null;
  amount_received: number | null;
}

export interface GenerateRemittanceListPrintParams {
  rows: RemittanceListRow[];
  periodStart: string;
  periodEnd: string;
  /** When provided (e.g. for PERA), overrides the period label in the header */
  periodLabelOverride?: string;
}

const getRemittancePreparedByName = () =>
  process.env.NEXT_PUBLIC_REMITTANCE_PREPARED_BY_NAME ??
  "SHELLA MAE N. SEVILLA";
const getRemittancePreparedByPosition = () =>
  process.env.NEXT_PUBLIC_REMITTANCE_PREPARED_BY_POSITION ??
  "Administrative Aide IV (Bookbinder II)";
const getRemittancePreparedByOffice = () =>
  process.env.NEXT_PUBLIC_REMITTANCE_PREPARED_BY_OFFICE ??
  "City Social Welfare and Development Office";

export function generateRemittanceListPrint({
  rows,
  periodStart,
  periodEnd,
  periodLabelOverride,
}: GenerateRemittanceListPrintParams): void {
  if (rows.length === 0) return;

  const periodLabel =
    periodLabelOverride ?? formatPeriodForHeader(periodStart, periodEnd);
  const totalAmount = rows.reduce(
    (sum, r) => sum + (r.amount_received ?? 0),
    0,
  );
  const amountFormatted = formatNum(totalAmount);

  const cityMayorName =
    process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "SAM NORMAN G. FUENTES";
  const cityMayorPosition =
    process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "City Mayor";

  const tableRowsHtml = rows
    .map(
      (r, i) => `
  <tr>
    <td class="text-center">${i + 1}</td>
    <td>${r.employeeName}</td>
    <td class="text-center">${r.lbp_savings_account_number ?? ""}</td>
    <td class="text-right">${formatNum(r.amount_received)}</td>
  </tr>`,
    )
    .join("");

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remittance List</title>
  <style>
    ${getOBRCommonStyles()}
    .remittance-header { text-align: center; margin: 4px 0; }
    .remittance-title { font-size: 16pt; font-weight: bold; margin-bottom: 2px; }
    .remittance-subtitle { font-size: 11pt; font-weight: bold; margin-bottom: 2px; }
    .remittance-period { font-size: 11pt; }
    .remittance-footer { display: flex; justify-content: space-between; margin-top: 8px; padding: 0 20px; }
    .remittance-footer-left, .remittance-footer-right { text-align: left; }
    .remittance-footer-right .remittance-signature-title { text-align: center; }
    .remittance-signature-label { font-size: 9pt; margin-bottom: 4px; }
    .remittance-signature-space { height: 32px; border-bottom: 1px solid #000; margin-bottom: 2px; }
    .remittance-signature-name { font-weight: bold; text-transform: uppercase; font-size: 10pt; }
    .remittance-signature-title { font-style: italic; font-size: 9pt; margin-top: 2px; }
    table tfoot { page-break-inside: avoid; }
  </style>
</head>
<body>
<table style="width: 100%; border: none;">
  <thead>
  <tr>
    <td colspan="4" style="border: none; padding: 4px 10px 6px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
          <div class="header-subtitle" style="color: #1e3a8a;">OFFICE OF THE CITY MAYOR</div>
          <div style="font-size: 10pt; font-weight: bold;">CITY OF OZAMIZ</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
      <div class="remittance-header">
        <div class="remittance-title">REMITTANCE LIST</div>
        <div class="remittance-subtitle">NET TAKE HOME PAY FOR DEPOSIT TO LBP ATM-SA</div>
        <div class="remittance-period">FOR THE PERIOD OF ${periodLabel}</div>
      </div>
    </td>
  </tr>
  <tr>
    <th style="width: 40px;">No.</th>
    <th style="min-width: 200px;">Name of Employee</th>
    <th style="min-width: 120px;">S/A Number</th>
    <th style="min-width: 100px;">Amount</th>
  </tr>
  </thead>
  <tbody>
  ${tableRowsHtml}
  <tr style="background-color: #f3f4f6; font-weight: bold;">
    <td colspan="3" class="text-right" style="padding: 6px 8px;">Total Remittance for Deposit to individual Savings Account</td>
    <td class="text-right">${amountFormatted}</td>
  </tr>
  </tbody>
  <tfoot>
  <tr>
    <td colspan="4" style="border: none; padding: 8px 10px 0;">
      <div class="remittance-footer">
        <div class="remittance-footer-left">
          <div class="remittance-signature-label">Prepared By:</div>
          <div class="remittance-signature-space"></div>
          <div class="remittance-signature-name">${getRemittancePreparedByName()}</div>
          <div class="remittance-signature-title">${getRemittancePreparedByPosition()}</div>
          <div class="remittance-signature-title">${getRemittancePreparedByOffice()}</div>
        </div>
        <div class="remittance-footer-right">
          <div class="remittance-signature-label">Certified By:</div>
          <div class="remittance-signature-space"></div>
          <div class="remittance-signature-name">${cityMayorName}</div>
          <div class="remittance-signature-title">${cityMayorPosition}</div>
        </div>
      </div>
    </td>
  </tr>
  </tfoot>
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

function formatMonthYearUpper(periodEnd: string): string {
  const d = new Date(periodEnd);
  const month = d.toLocaleString("en-US", { month: "long" }).toUpperCase();
  return `${month} ${d.getFullYear()}`;
}

/** e.g. "For the month of April 1-30, 2026" from payroll period bounds */
function formatSssPayrollPeriodLine(
  periodStart: string,
  periodEnd: string,
): string {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const sameMonthYear =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const year = end.getFullYear();
  if (sameMonthYear) {
    const monthLong = start.toLocaleString("en-US", { month: "long" });
    return `For the month of ${monthLong} ${startDay}-${endDay}, ${year}`;
  }
  const sm = start.toLocaleString("en-US", { month: "long" });
  const em = end.toLocaleString("en-US", { month: "long" });
  return `For the period ${sm} ${startDay}, ${start.getFullYear()} – ${em} ${endDay}, ${year}`;
}

/** COURAGE-2: No., Name, Monthly Basic Salary, Monthly Amortization, Remarks. */
export interface RemittanceListCourage2Row {
  employeeName: string;
  monthly_basic_salary: number | null;
  monthly_amortization: number | null;
}

/** SSS LGU remittance list: No., Name, SS Number, SE/VM, SS, EC, Total. */
export interface RemittanceListSssRow {
  employeeName: string;
  ssNumber: string | null;
  /** Always VM per LGU form */
  seVm: "VM";
  ss: number | null;
  ec: number | null;
}

/** EEMPC PERA: No., Name, PERA (deduction), Remarks only. */
export interface RemittanceListEempcPeraRow {
  employeeName: string;
  pera: number | null;
}

export type GenerateRemittanceListAmortizationPrintParams =
  | {
      kind: "courage2";
      rows: RemittanceListCourage2Row[];
      periodStart: string;
      periodEnd: string;
    }
  | {
      kind: "sss";
      rows: RemittanceListSssRow[];
      periodStart: string;
      periodEnd: string;
    }
  | {
      kind: "eempc";
      rows: RemittanceListEempcPeraRow[];
      periodStart: string;
      periodEnd: string;
    };

export function generateRemittanceListAmortizationPrint(
  params: GenerateRemittanceListAmortizationPrintParams,
): void {
  const headerShell = (titleHtml: string, colCount: number) => `
  <tr>
    <td colspan="${colCount}" style="border: none; padding: 4px 10px 6px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
          <div class="header-subtitle" style="color: #1e3a8a;">OFFICE OF THE CITY MAYOR</div>
          <div style="font-size: 10pt; font-weight: bold;">CITY OF OZAMIZ</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
      <div class="remittance-header">
        ${titleHtml}
      </div>
    </td>
  </tr>`;

  const footerPreparedOnly = (colCount: number) => `
  <tfoot>
  <tr>
    <td colspan="${colCount}" style="border: none; padding: 8px 10px 0;">
      <div class="remittance-footer remittance-footer-prepared-only">
        <div class="remittance-footer-left">
          <div class="remittance-signature-label">Prepared By:</div>
          <div class="remittance-signature-space"></div>
          <div class="remittance-signature-name">${getRemittancePreparedByName()}</div>
          <div class="remittance-signature-title">${getRemittancePreparedByPosition()}</div>
          <div class="remittance-signature-title">${getRemittancePreparedByOffice()}</div>
        </div>
      </div>
    </td>
  </tr>
  </tfoot>`;

  const commonStyles = `
    ${getOBRCommonStyles()}
    .remittance-header { text-align: center; margin: 4px 0; }
    .remittance-title-block { font-size: 13pt; font-weight: bold; line-height: 1.4; text-transform: uppercase; }
    .remittance-footer { margin-top: 8px; padding: 0 20px; }
    .remittance-footer-prepared-only { justify-content: flex-start; }
    .remittance-footer-left { text-align: left; }
    .remittance-signature-label { font-size: 9pt; margin-bottom: 4px; }
    .remittance-signature-space { height: 32px; border-bottom: 1px solid #000; margin-bottom: 2px; }
    .remittance-signature-name { font-weight: bold; text-transform: uppercase; font-size: 10pt; }
    .remittance-signature-title { font-style: italic; font-size: 9pt; margin-top: 2px; }
    table tfoot { page-break-inside: avoid; }
  `;

  if (params.kind === "courage2") {
    const { rows, periodEnd } = params;
    if (rows.length === 0) return;

    const totalAmortization = rows.reduce(
      (sum, r) => sum + (r.monthly_amortization ?? 0),
      0,
    );
    const totalBasic = rows.reduce(
      (sum, r) => sum + (r.monthly_basic_salary ?? 0),
      0,
    );
    const amortFormatted = formatNum(totalAmortization);
    const basicFormatted = formatNum(totalBasic);

    const titleHtml = `
        <div class="remittance-title-block">
          REMITTANCE OF COURAGE-2<br/>
          SALARY LOAN DEDUCTION<br/>
          FOR THE MONTH OF ${formatMonthYearUpper(periodEnd)}
        </div>`;

    const tableRowsHtml = rows
      .map(
        (r, i) => `
  <tr>
    <td class="text-center">${i + 1}</td>
    <td>${r.employeeName}</td>
    <td class="text-right">${formatNum(r.monthly_basic_salary)}</td>
    <td class="text-right">${formatNum(r.monthly_amortization)}</td>
    <td></td>
  </tr>`,
      )
      .join("");

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remittance List</title>
  <style>${commonStyles}</style>
</head>
<body>
<table style="width: 100%; border: none;">
  <thead>
  ${headerShell(titleHtml, 5)}
  <tr>
    <th style="width: 40px;">No.</th>
    <th style="min-width: 200px;">Name of Employee</th>
    <th style="min-width: 110px;">Monthly Basic Salary</th>
    <th style="min-width: 140px;">Monthly Amortization</th>
    <th style="min-width: 90px;">Remarks (Blank)</th>
  </tr>
  </thead>
  <tbody>
  ${tableRowsHtml}
  <tr style="background-color: #f3f4f6; font-weight: bold;">
    <td colspan="2" class="text-right" style="padding: 6px 8px;">Total</td>
    <td class="text-right">${basicFormatted}</td>
    <td class="text-right">${amortFormatted}</td>
    <td></td>
  </tr>
  </tbody>
  ${footerPreparedOnly(5)}
</table>
</body>
</html>
  `.trim();

    printHTMLContent(htmlContent);
    return;
  }

  if (params.kind === "sss") {
    const { rows, periodStart, periodEnd } = params;
    if (rows.length === 0) return;

    const totalSs = rows.reduce((sum, r) => sum + (r.ss ?? 0), 0);
    const totalEc = rows.reduce((sum, r) => sum + (r.ec ?? 0), 0);
    const totalAll = totalSs + totalEc;
    const ssTot = formatNum(totalSs);
    const ecTot = formatNum(totalEc);
    const allTot = formatNum(totalAll);

    const periodLine = formatSssPayrollPeriodLine(periodStart, periodEnd);
    const titleHtml = `
      <div class="sss-sss-print-header">
        <div class="sss-line">REPUBLIC OF THE PHILIPPINES</div>
        <div class="sss-line">SOCIAL SECURITY SYSTEM</div>
        <div class="sss-line">OZAMIZ CITY</div>
        <div class="sss-spacer"></div>
        <div class="sss-line">OFFICE OF THE CITY MAYOR</div>
        <div class="sss-line">LIST OF LGU OZAMIZ-REGULAR EMPLOYEES WITH SIGNED AUTHORITY TO DEDUCT</div>
        <div class="sss-line">SSS CONTRIBUTION FROM MONTHLY SALARY</div>
        <div class="sss-period">${periodLine}</div>
      </div>`;

    const ttsStyles = `
    ${commonStyles}
    .sss-sss-header { align-items: flex-start; padding-bottom: 10px; }
    .sss-sss-header .header-center { text-align: center; }
    .sss-sss-print-header { text-align: center; margin: 0; }
    .sss-line { font-size: 11pt; font-weight: bold; line-height: 1.35; text-transform: uppercase; }
    .sss-spacer { height: 8px; }
    .sss-period { font-size: 11pt; font-weight: bold; margin-top: 8px; line-height: 1.35; }
    `;

    const tableRowsHtml = rows
      .map((r, i) => {
        const lineTotal = (r.ss ?? 0) + (r.ec ?? 0);
        return `
  <tr>
    <td class="text-center">${i + 1}</td>
    <td>${r.employeeName}</td>
    <td class="text-left" style="font-size: 9pt;">${r.ssNumber?.trim() || ""}</td>
    <td class="text-center">${r.seVm}</td>
    <td class="text-right">${formatNum(r.ss)}</td>
    <td class="text-right">${formatNum(r.ec)}</td>
    <td class="text-right">${formatNum(lineTotal)}</td>
  </tr>`;
      })
      .join("");

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SSS Contribution List</title>
  <style>${ttsStyles}</style>
</head>
<body>
<table style="width: 100%; border: none;">
  <thead>
  <tr>
    <td colspan="7" style="border: none; padding: 4px 10px 6px;">
      <div class="header sss-sss-header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          ${titleHtml}
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
    </td>
  </tr>
  <tr>
    <th style="width: 36px;">No.</th>
    <th style="min-width: 160px;">Name of Employee</th>
    <th style="min-width: 100px;">SS Number</th>
    <th style="width: 52px;">SE/VM</th>
    <th style="min-width: 72px;">SS</th>
    <th style="min-width: 72px;">EC</th>
    <th style="min-width: 80px;">Total</th>
  </tr>
  </thead>
  <tbody>
  ${tableRowsHtml}
  <tr style="background-color: #f3f4f6; font-weight: bold;">
    <td colspan="4" class="text-right" style="padding: 6px 8px;">Total</td>
    <td class="text-right">${ssTot}</td>
    <td class="text-right">${ecTot}</td>
    <td class="text-right">${allTot}</td>
  </tr>
  </tbody>
  ${footerPreparedOnly(7)}
</table>
</body>
</html>
  `.trim();

    printHTMLContent(htmlContent);
    return;
  }

  const { rows, periodEnd } = params;
  if (rows.length === 0) return;

  const totalPera = rows.reduce((sum, r) => sum + (r.pera ?? 0), 0);
  const peraFormatted = formatNum(totalPera);

  const titleHtml = `
        <div class="remittance-title-block">
          REMITTANCE LIST FOR ECONOMIC ENTERPRISE MULTIPURPOSE COOPERATIVE (EEMPC)<br/>
          PERA LOAN REPAYMENT FOR THE MONTH OF ${formatMonthYearUpper(periodEnd)}
        </div>`;

  const tableRowsHtml = rows
    .map(
      (r, i) => `
  <tr>
    <td class="text-center">${i + 1}</td>
    <td>${r.employeeName}</td>
    <td class="text-right">${formatNum(r.pera)}</td>
    <td></td>
  </tr>`,
    )
    .join("");

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remittance List</title>
  <style>${commonStyles}</style>
</head>
<body>
<table style="width: 100%; border: none;">
  <thead>
  ${headerShell(titleHtml, 4)}
  <tr>
    <th style="width: 40px;">No.</th>
    <th style="min-width: 220px;">Name of Employee</th>
    <th style="min-width: 100px;">PERA</th>
    <th style="min-width: 90px;">Remarks (Blank)</th>
  </tr>
  </thead>
  <tbody>
  ${tableRowsHtml}
  <tr style="background-color: #f3f4f6; font-weight: bold;">
    <td colspan="2" class="text-right" style="padding: 6px 8px;">Total</td>
    <td class="text-right">${peraFormatted}</td>
    <td></td>
  </tr>
  </tbody>
  ${footerPreparedOnly(4)}
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

// OBR - same format as Purchase Request OBR
export interface PayrollOBR1stHalfTotals {
  amount_earned: number;
  gsis_govt_share: number;
  pag_ibig_govt_share: number;
  philhealth_govt_share: number;
  sif: number;
}

export interface GeneratePayrollOBRPrintParams {
  particulars: string;
  totalAmount: number;
  period_type?: "1st Half" | "2nd Half";
  firstHalfTotals?: PayrollOBR1stHalfTotals;
  /** When provided (e.g. "5-01-02-010" for PERA), uses single account code row */
  accountCode?: string;
}

// OBR styles - same as Purchase Request
const getOBRCommonStyles = () =>
  `
    @page {
      size: 8.5in 13in;
      margin-top: 0.3in;
      margin-bottom: 0.3in;
      margin-left: 0.5in;
      margin-right: 0.5in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.2; color: #000; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; }
    .header-left { display: flex; align-items: center; gap: 15px; }
    .header-center { text-align: center; flex: 1; }
    .header-right { display: flex; align-items: center; gap: 15px; }
    .logo { width: 80px; height: 80px; }
    .header-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .header-subtitle { font-size: 10pt; font-weight: bold; color: #1e3a8a; }
    .header-info { font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 5px; }
    table th, table td { border: 1px solid #000; padding: 4px; vertical-align: top; }
    table th { background-color: #e5e7eb; font-weight: bold; text-align: center; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .signature-name { font-weight: bold; text-transform: uppercase; }
    .signature-title { font-size: 9pt; font-style: italic; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;

const getOBRCityMayorName = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "SAM NORMAN G. FUENTES";
const getOBRCityMayorPosition = () =>
  process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "City Mayor";
const getOBRBudgetOfficerName = () =>
  process.env.NEXT_PUBLIC_BUDGET_OFFICER_NAME ?? "EVELYN T. OMILDA";
const getOBRBudgetOfficerPosition = () =>
  process.env.NEXT_PUBLIC_BUDGET_OFFICER_POSITION ?? "Budget Officer";

function formatOBRAmount(val: number): string {
  return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function generatePayrollOBRPrint({
  particulars,
  totalAmount,
  period_type,
  firstHalfTotals,
  accountCode,
}: GeneratePayrollOBRPrintParams): void {
  const is1stHalf = period_type === "1st Half" && firstHalfTotals != null;
  const amountFormatted = formatOBRAmount(totalAmount);

  const particularsText = particulars || "";

  const is2ndHalf = period_type === "2nd Half";
  const accountCodeRows =
    accountCode != null
      ? [{ code: accountCode, amount: formatOBRAmount(totalAmount) }]
      : is1stHalf
    ? [
        {
          code: "5-01-01-010",
          amount: formatOBRAmount(firstHalfTotals!.amount_earned),
        },
        {
          code: "5-01-03-010",
          amount: formatOBRAmount(firstHalfTotals!.gsis_govt_share),
        },
        {
          code: "5-01-03-020",
          amount: formatOBRAmount(firstHalfTotals!.pag_ibig_govt_share),
        },
        {
          code: "5-01-03-030",
          amount: formatOBRAmount(firstHalfTotals!.philhealth_govt_share),
        },
        {
          code: "5-01-03-040",
          amount: formatOBRAmount(firstHalfTotals!.sif),
        },
      ]
      : is2ndHalf
        ? [
            {
              code: "5-01-01-010",
              amount: formatOBRAmount(totalAmount),
            },
          ]
        : null;

  const alignBase = "font-size: 11pt; vertical-align: middle;";
  const amtAlign =
    is2ndHalf || accountCode != null
      ? "text-align: right;"
      : "text-align: center;";

  const firstRowPad = "padding-top: 20px;";
  const lastRowPad = "padding-bottom: 20px;";

  const dataRowsHtml =
    accountCodeRows != null
      ? accountCodeRows
          .map((row, i) => {
            const isFirst = i === 0;
            const isLast = i === accountCodeRows!.length - 1;
            const rowPad = [
              isFirst ? firstRowPad : "",
              isLast ? lastRowPad : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `
  <tr>
    ${isFirst ? `<td rowspan="${accountCodeRows!.length}" style="${alignBase} ${rowPad} text-align: center;">1011</td>` : ""}
    ${isFirst ? `<td rowspan="${accountCodeRows!.length}" style="${alignBase} ${rowPad} padding: calc(1in + 15px) 10px; text-align: center;"><strong>${particularsText}</strong></td>` : ""}
    ${isFirst ? `<td rowspan="${accountCodeRows!.length}" style="${alignBase} ${rowPad}"></td>` : ""}
    <td style="${alignBase} ${rowPad} text-align: center; border: 0; border-left: 1px solid #000; border-right: 1px solid #000;">${row.code}</td>
    <td style="${alignBase} ${rowPad} ${amtAlign} border: 0; border-left: 1px solid #000; border-right: 1px solid #000;"><strong>${row.amount}</strong></td>
  </tr>`;
          })
          .join("")
      : `
  <tr>
    <td style="height: 200px; vertical-align: middle; text-align: center; font-size: 11pt; ${firstRowPad} ${lastRowPad}">1011</td>
    <td style="vertical-align: top; padding: 30px 10px; text-align: center; font-size: 11pt; padding-top: calc(1in + 40px); padding-bottom: calc(1in + 40px);">
      <div style="margin-top: 20px; margin-bottom: 20px;">
        <strong style="font-size: 11pt;">${particularsText}</strong>
      </div>
    </td>
    <td style="font-size: 11pt; ${firstRowPad} ${lastRowPad}"></td>
    <td style="font-size: 11pt; text-align: center; vertical-align: middle; ${firstRowPad} ${lastRowPad}">5-01-01-010</td>
    <td class="text-right" style="vertical-align: middle; padding-top: 80px; font-size: 11pt; ${lastRowPad}">
      <strong style="font-size: 11pt;">${amountFormatted}</strong>
    </td>
  </tr>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Obligation Request - Payroll</title>
  <style>
    ${getOBRCommonStyles()}
    table { font-size: 11pt !important; }
    table th, table td { font-size: 11pt !important; }
    .header-info { font-size: 10pt !important; }
  </style>
</head>
<body>
<table style="border: 1px solid #000;">
  <tr>
    <td colspan="5" style="border: none; padding: 10px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
          <div class="header-subtitle" style="color: #1e3a8a;">OFFICE OF THE CITY MAYOR</div>
          <div style="font-size: 10pt; font-weight: bold;">CITY OF OZAMIZ</div>
          <div class="header-info">TELEFAX NO. (088)521-1390</div>
          <div class="header-info">MOBILE NO. (0917) 777 6100</div>
          <div class="header-info">EMAIL: ASENSOOZAMIZMAYOR@GMAIL.COM</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
    </td>
  </tr>
  <tr>
    <th colspan="4" style="font-size: 14pt;">OBLIGATION REQUEST</th>
    <th style="width: 15%; text-align: left; vertical-align: top;">No.</th>
  </tr>
  <tr>
    <td style="width: 20%; font-weight: bold; font-size: 11pt;">Payee/Office</td>
    <td colspan="4" style="font-size: 11pt;font-weight: bold;">FUENTES, SAM NORMAN G. AND COMPANY</td>
  </tr>
  <tr>
    <td style="font-weight: bold; font-size: 11pt;">Office</td>
    <td colspan="4" style="font-weight: bold; font-size: 11pt;">OFFICE OF THE CITY MAYOR</td>
  </tr>
  <tr>
    <td style="font-weight: bold; font-size: 11pt;">Address</td>
    <td colspan="4" style="font-weight: bold; font-size: 11pt;">Ozamiz City</td>
  </tr>
  <tr>
    <th style="width: 12%; font-size: 11pt;">Responsibility<br>Center</th>
    <th style="width: 48%; font-size: 11pt;">PARTICULARS</th>
    <th style="width: 8%; font-size: 11pt;">F.P.P</th>
    <th style="width: 20%; font-size: 11pt;">Account<br>Code</th>
    <th style="width: 12%; font-size: 11pt;">Amount</th>
  </tr>
  ${dataRowsHtml}
  <tr>
    <td colspan="4" class="text-right" style="font-weight: bold; padding-right: 10px; font-size: 11pt;">TOTAL:</td>
    <td class="text-right" style="font-size: 11pt;"><strong style="font-size: 11pt;">${amountFormatted}</strong></td>
  </tr>
  <tr>
    <td colspan="2" style="width: 50%; font-size: 11pt;">
      <div style="padding: 5px;">
        <strong style="font-size: 11pt;">A. Certified</strong><br>
        <div style="margin-left: 10px; margin-top: 5px; font-size: 9pt;">
          <input type="checkbox" style="margin-right: 5px;">Charges to appropriation/allotment<br>
          necessary, lawful and under my direct<br>
          supervision<br><br>
          <input type="checkbox" style="margin-right: 5px;">Supporting documents valid, proper<br>
          and legal
        </div>
      </div>
    </td>
    <td colspan="3" style="width: 50%; font-size: 11pt;">
      <div style="padding: 5px;">
        <strong style="font-size: 11pt;">B. Certified</strong><br>
        <div style="margin-top: 40px; text-align: center; font-size: 9pt;">
          Existence of available appropriation
        </div>
      </div>
    </td>
  </tr>
  <tr>
    <td style="width: 12%; text-align: center; vertical-align: top; font-size: 11pt;"><strong style="font-size: 11pt;">Signature</strong></td>
    <td style="text-align: center; vertical-align: top;padding-bottom: 50px; font-size: 11pt;"></td>
    <td colspan="3" style="text-align: center; vertical-align: top;padding-bottom: 50px; font-size: 11pt;"></td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;"><strong style="font-size: 11pt;">Printed Name</strong></td>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;">
      <div class="signature-name" style="font-size: 11pt;">${getOBRCityMayorName()}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top; font-size: 11pt;">
      <div class="signature-name" style="font-size: 11pt;">${getOBRBudgetOfficerName()}</div>
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;"><strong style="font-size: 11pt;"> Designation</strong></td>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;">
      <div class="signature-title" style="font-size: 10pt;">${getOBRCityMayorPosition()}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top; font-size: 11pt;">
      <div class="signature-title" style="font-size: 10pt;">${getOBRBudgetOfficerPosition()}</div>
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;"><strong style="font-size: 11pt;">Date</strong></td>
    <td style="text-align: center; vertical-align: top; font-size: 11pt;"></td>
    <td colspan="3" style="text-align: center; vertical-align: top; font-size: 11pt;"></td>
  </tr>
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

/**
 * COS (Contract of Service) payroll print.
 * Follows the PERA payroll layout: landscape 17x11, 18 rows/page, page subtotals,
 * grand total on last page, Mayor/Treasurer/Administrator signatories.
 *
 * Columns: No | Employee Name | CMO ID | Designation | Monthly Salary |
 *          Absent without pay | Total Net Salary | SSS SS | SSS EC |
 *          Percentage Tax 3% (blank) | Expanded W/Tax 5% | No. |
 *          Net Amount Received | Signature of Payee
 */
export interface PayrollCosRow {
  employeeName: string;
  cmoIdNo: string;
  designation: string;
  monthly_rate: number | null;
  absent_without_pay: number | null;
  total_net_salary: number;
  ss_contribution: number | null;
  ss_contribution_ec: number | null;
  percentage_tax_3: number | null;
  expanded_withholding_tax: number;
  net_amount_received: number;
}

export interface GenerateCosPayrollPrintParams {
  rows: PayrollCosRow[];
  periodStart: string;
  periodEnd: string;
}

const ROWS_PER_PAGE_COS = 20;

function sumRowsCos(rows: PayrollCosRow[]) {
  const sum = (v: (number | null | undefined)[]): number =>
    v.reduce<number>((acc, x) => acc + (Number(x) || 0), 0);
  return {
    monthly_rate: sum(rows.map((r) => r.monthly_rate)),
    absent_without_pay: sum(rows.map((r) => r.absent_without_pay)),
    total_net_salary: sum(rows.map((r) => r.total_net_salary)),
    ss_contribution: sum(rows.map((r) => r.ss_contribution)),
    ss_contribution_ec: sum(rows.map((r) => r.ss_contribution_ec)),
    percentage_tax_3: sum(rows.map((r) => r.percentage_tax_3)),
    expanded_withholding_tax: sum(rows.map((r) => r.expanded_withholding_tax)),
    net_amount_received: sum(rows.map((r) => r.net_amount_received)),
  };
}

type SumRowsCosTotals = ReturnType<typeof sumRowsCos>;

function buildTotalRowCos(
  label: string,
  totals: SumRowsCosTotals,
  rowClass: string,
): string {
  return `
    <tr class="${rowClass}" style="font-weight: bold;">
      <td colspan="4" class="text-right">${label}</td>
      <td class="text-right">${formatNum(totals.monthly_rate)}</td>
      <td class="text-right">${formatNum(totals.absent_without_pay)}</td>
      <td class="text-right">${formatNum(totals.total_net_salary)}</td>
      <td class="text-right">${formatNum(totals.ss_contribution)}</td>
      <td class="text-right">${formatNum(totals.ss_contribution_ec)}</td>
      <td class="text-right">${formatNum(totals.percentage_tax_3)}</td>
      <td class="text-right">${formatNum(totals.expanded_withholding_tax)}</td>
      <td></td>
      <td class="text-right">${formatNum(totals.net_amount_received)}</td>
      <td></td>
    </tr>`;
}

export function generateCosPayrollPrint({
  rows,
  periodStart,
  periodEnd,
}: GenerateCosPayrollPrintParams): void {
  if (rows.length === 0) return;

  const cityMayorName = process.env.NEXT_PUBLIC_CITY_MAYOR_NAME ?? "";
  const cityMayorPosition = process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION ?? "";
  const cityTreasurerName = process.env.NEXT_PUBLIC_CITY_TREASURER_NAME ?? "";
  const cityTreasurerPosition =
    process.env.NEXT_PUBLIC_CITY_TREASURER_POSITION ?? "";
  const cityAdministratorName =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_NAME ?? "";
  const cityAdministratorPosition =
    process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR_POSITION ?? "";
  const cityAccountantName =
    process.env.NEXT_PUBLIC_CITY_ACCOUNTANT_NAME ??
    "Easy Xaflavaire Hope E. Dimal";
  const cityAccountantPosition = "City Accountant";

  const periodLabel = formatPeriodForHeader(periodStart, periodEnd);

  const TOTAL_COLS = 14;
  const headerRows = `
      <tr class="payroll-header-row payroll-cos-header-title">
        <th colspan="${TOTAL_COLS}" class="payroll-header-center">CONTRACT OF SERVICE</th>
      </tr>
      <tr class="payroll-header-row payroll-cos-header-title">
        <th colspan="${TOTAL_COLS}" class="payroll-header-center">OFFICE OF THE CITY MAYOR</th>
      </tr>
      <tr class="payroll-header-row payroll-cos-header-title">
        <th colspan="${TOTAL_COLS}" class="payroll-cos-title-main">${periodLabel}</th>
      </tr>
      <tr class="payroll-header-row payroll-cos-header-title">
        <th colspan="${TOTAL_COLS}" class="payroll-cos-title-period">PERIOD</th>
      </tr>
      <tr class="payroll-header-row payroll-cos-ack-header">
        <th colspan="${TOTAL_COLS}" class="payroll-cos-ack-cell">
          <div class="payroll-header-bottom">
            <div class="payroll-acknowledgement">We Acknowledge receipt of the sum shown opposite our names as full compensation for services rendered for the period stated:</div>
            <div class="payroll-accountant">
              <div class="name">${cityAccountantName}</div>
              <div class="position">${cityAccountantPosition}</div>
            </div>
          </div>
        </th>
      </tr>
`;

  const columnHeadersHtml = `
      <tr>
        <th class="payroll-cos-th payroll-cos-th-no" rowspan="2">No.</th>
        <th class="payroll-cos-th payroll-cos-th-name" rowspan="2">Employee<br/>Name</th>
        <th class="payroll-cos-th payroll-cos-th-cmo" rowspan="2">CMO ID<br/>No.</th>
        <th class="payroll-cos-th payroll-cos-th-designation" rowspan="2">Designation</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Monthly<br/>Salary</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Absent<br/>without<br/>pay</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Total Net<br/>Salary</th>
        <th class="payroll-cos-th payroll-cos-th-sss" colspan="2">SSS Contribution</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Percentage<br/>Tax 3%</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Expanded<br/>Withholding<br/>Tax (5%)</th>
        <th class="payroll-cos-th payroll-cos-th-no" rowspan="2">No.</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num" rowspan="2">Net Amount<br/>Received</th>
        <th class="payroll-cos-th payroll-cos-th-signature" rowspan="2">SIGNATURE<br/>OF<br/>PAYEE</th>
      </tr>
      <tr>
        <th class="payroll-cos-th payroll-cos-th-compact-num">SS</th>
        <th class="payroll-cos-th payroll-cos-th-compact-num">EC</th>
      </tr>
`;

  const grandTotals = sumRowsCos(rows);
  const pages: PayrollCosRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE_COS) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE_COS));
  }

  const pageTables: string[] = [];
  let rowIndex = 0;
  for (let p = 0; p < pages.length; p++) {
    const pageRows = pages[p];
    const isLastPage = p === pages.length - 1;
    const rowParts: string[] = [];
    for (const r of pageRows) {
      rowIndex += 1;
      rowParts.push(`
    <tr>
      <td class="text-center payroll-cos-col-no">${rowIndex}</td>
      <td class="payroll-cos-cell-name">${r.employeeName}</td>
      <td class="text-center payroll-cos-cell-cmo">${r.cmoIdNo}</td>
      <td class="payroll-cos-cell-designation">${r.designation}</td>
      <td class="text-right">${formatNum(r.monthly_rate)}</td>
      <td class="text-right">${formatNum(r.absent_without_pay)}</td>
      <td class="text-right">${formatNum(r.total_net_salary)}</td>
      <td class="text-right">${formatNum(r.ss_contribution)}</td>
      <td class="text-right">${formatNum(r.ss_contribution_ec)}</td>
      <td class="text-right">${formatNum(r.percentage_tax_3)}</td>
      <td class="text-right">${formatNum(r.expanded_withholding_tax)}</td>
      <td class="text-center payroll-cos-col-no">${rowIndex}</td>
      <td class="text-right">${formatNum(r.net_amount_received)}</td>
      <td class="text-center payroll-cos-cell-signature"></td>
    </tr>
  `);
    }
    const pageTotals = sumRowsCos(pageRows);
    rowParts.push(
      buildTotalRowCos("Sub Total", pageTotals, "subtotal-row"),
    );
    if (isLastPage) {
      rowParts.push(
        buildTotalRowCos("Grand Total", grandTotals, "grandtotal-row"),
      );
    }
    const signatoriesTfoot = `
    <tfoot>
      <tr>
        <td colspan="${TOTAL_COLS}" style="border: none; vertical-align: top;">
          <div class="signatories-row signatories-three-cols" aria-label="Approved by">
            <div class="signatory">
              <div class="certification">CERTIFIED: Service have been duly rendered as stated:</div>
              <div class="name">${cityMayorName}</div>
              <div class="position">${cityMayorPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Funds available in the amount of P</div>
              <div class="name">${cityTreasurerName}</div>
              <div class="position">${cityTreasurerPosition}</div>
            </div>
            <div class="signatory">
              <div class="certification">CERTIFIED: Each employee whose name appears above has been paid the amount indicated opposite his/her name.</div>
              <div class="name">${cityAdministratorName}</div>
              <div class="position">${cityAdministratorPosition}</div>
            </div>
          </div>
        </td>
      </tr>
    </tfoot>`;
    pageTables.push(`
  <div class="payroll-page" style="page-break-after: ${isLastPage ? "auto" : "always"};">
    <table class="payroll-cos-table">
      <thead>${headerRows}${columnHeadersHtml}
    </thead>
    <tbody>${rowParts.join("")}</tbody>${signatoriesTfoot}
    </table>
  </div>`);
  }

  const landscapeStylesCos = `
    @page {
      size: 17in 11in landscape;
      margin-top: 0.2in;
      margin-bottom: 0.3in;
      margin-left: 0.3in;
      margin-right: 0.3in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.2; color: #000; background: #fff; }
    table.payroll-cos-table { width: 100%; border-collapse: collapse; table-layout: auto; }
    table.payroll-cos-table tbody tr { page-break-inside: avoid; }
    table.payroll-cos-table tfoot { page-break-inside: avoid; }
    table.payroll-cos-table th, table.payroll-cos-table td { border: 1px solid #000; padding: 5px 3px; vertical-align: middle; }
    table.payroll-cos-table thead tr.payroll-header-row th,
    table.payroll-cos-table thead tr.payroll-cos-ack-header th.payroll-cos-ack-cell {
      border: none !important;
      background: none !important;
    }
    .payroll-cos-title-main {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      padding: 4px 0 2px !important;
    }
    .payroll-cos-title-period {
      text-align: center;
      font-size: 10pt;
      font-weight: bold;
      padding: 0 0 6px !important;
    }
    .payroll-cos-ack-cell { padding: 4px 0 !important; }
    table.payroll-cos-table thead th.payroll-header-center {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      padding: 2px 0 !important;
    }
    table.payroll-cos-table th.payroll-cos-th { background-color: #e5e7eb; font-weight: bold; text-align: center; font-size: 7pt; line-height: 1.2; padding: 5px 2px; }
    table.payroll-cos-table thead th.payroll-cos-th-no,
    table.payroll-cos-table tbody td.payroll-cos-col-no {
      width: 0.01%;
      padding: 5px 2px;
      white-space: nowrap;
    }
    table.payroll-cos-table th.payroll-cos-th-name,
    table.payroll-cos-table td.payroll-cos-cell-name {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-cos-table th.payroll-cos-th-cmo,
    table.payroll-cos-table td.payroll-cos-cell-cmo {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-cos-table thead th.payroll-cos-th-designation,
    table.payroll-cos-table tbody td.payroll-cos-cell-designation {
      min-width: 12em;
      white-space: nowrap;
      width: auto;
    }
    table.payroll-cos-table thead th.payroll-cos-th-compact-num,
    table.payroll-cos-table thead th.payroll-cos-th-sss {
      white-space: nowrap;
      width: auto;
    }
    table.payroll-cos-table tbody td.text-right {
      white-space: nowrap;
    }
    table.payroll-cos-table thead th.payroll-cos-th-signature,
    table.payroll-cos-table tbody td.payroll-cos-cell-signature {
      min-width: 1.35in;
      width: 1.5in;
      box-sizing: border-box;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .subtotal-row { background-color: #f3f4f6; }
    .grandtotal-row { background-color: #e5e7eb; }
    .signatory { text-align: center; min-width: 0; font-size: 8pt; }
    .signatory .certification { font-size: 6pt; margin-bottom: 0.35in; max-width: 1.8in; line-height: 1.2; }
    .signatory .name { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; display: inline-block; min-width: 1.5in; }
    .signatory .position { font-size: 7pt; margin-top: 2px; }
    tfoot .signatories-row { display: flex; justify-content: space-between; padding: 0.2in 1in; }
    tfoot .signatories-three-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1in; padding: 0.2in 1in; }
    .payroll-header-row { border: none; }
    .payroll-header-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 1in; }
    .payroll-acknowledgement { font-size: 6pt; max-width: 4in; text-align: left; }
    .payroll-accountant { text-align: right; }
    .payroll-accountant .name { font-size: 8pt; }
    .payroll-accountant .position { font-size: 7pt; font-style: italic; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COS Payroll</title>
  <style>${landscapeStylesCos}</style>
</head>
<body>
${pageTables.join("")}
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}
