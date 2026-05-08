"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  getPayrollById,
  type PayrollListRow,
  type EmployeePayrollWithEmployee,
} from "@/lib/actions/payroll-actions";
import {
  generatePayrollPrint,
  generatePayrollPrint2ndHalf,
  generatePayrollPeraPrint,
  generateRemittanceListPrint,
  generateRemittanceListAmortizationPrint,
  generatePayrollOBRPrint,
} from "@/lib/pdf/generatePayroll";
import {
  computeAmountEarnedFor1stHalfPrint,
  getTotalDeductions,
} from "@/lib/utils/payrollAmountCalc";
import {
  computeNetPeraAmount,
  getPeraMonthlyAmountFromEnv,
} from "@/lib/utils/peraAmount";
import { getEffectivePosition } from "@/lib/employee-position";

type PrintKind =
  | "payroll1"
  | "payroll2"
  | "pera"
  | "obr1"
  | "obr2"
  | "obrPera"
  | "remit1"
  | "remit2"
  | "remitPera"
  | "remitCourage2Pera"
  | "remitEempcPera"
  | "sss";

interface Props {
  payroll: PayrollListRow | null;
  onOpenChange: (o: boolean) => void;
}

function fullName(e: EmployeePayrollWithEmployee["employees"]): string {
  if (!e) return "";
  return `${e.last_name}, ${e.first_name}${e.middle_name ? " " + e.middle_name : ""}`;
}

export function PayrollPrintMenu({ payroll, onOpenChange }: Props) {
  const open = !!payroll;
  const [kind, setKind] = useState<PrintKind>("payroll1");
  const [obrParticulars, setObrParticulars] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!payroll) return;
    setRunning(true);
    try {
      const { employees } = await getPayrollById(payroll.id);
      if (employees.length === 0) {
        toast.error("No employees in this payroll yet");
        return;
      }

      const peraBase = getPeraMonthlyAmountFromEnv();

      switch (kind) {
        case "payroll1": {
          const rows = employees.map((emp, i) => ({
            "#": i + 1,
            employeeName: fullName(emp.employees),
            designation: emp.designation ?? (emp.employees && getEffectivePosition(emp.employees)) ?? "",
            monthly_rate: emp.monthly_rate,
            amount_earned: computeAmountEarnedFor1stHalfPrint(
              Number(emp.amount_received ?? 0),
              emp,
            ),
            sif: emp.sif,
            withholding_tax: emp.withholding_tax,
            philhealth_personal_share: emp.philhealth_personal_share,
            philhealth_govt_share: emp.philhealth_govt_share,
            gsis_personal_share: emp.gsis_personal_share,
            gsis_govt_share: emp.gsis_govt_share,
            pag_ibig_personal_share: emp.pag_ibig_personal_share,
            pag_ibig_govt_share: emp.pag_ibig_govt_share,
            hmdf: emp.hmdf,
            pag_ibig_salary_loan: emp.pag_ibig_salary_loan,
            ss_contribution:
              (emp.ss_contribution ?? 0) + (emp.ss_contribution_ec ?? 0),
            gsis_repayments_mpl: emp.gsis_repayments_mpl,
            gsis_repayments_mpl_lite: emp.gsis_repayments_mpl_lite,
            gsis_repayments_policy_loan: emp.gsis_repayments_policy_loan,
            gsis_repayments_cpl: emp.gsis_repayments_cpl,
            courage_2_contribution: emp.courage_2_contribution,
            courage_salary_loan: emp.courage_salary_loan,
            economic_enterprise_multipurpose_coop:
              emp.economic_enterprise_multipurpose_coop,
            eempc_salary_loan: emp.eempc_salary_loan,
            emergency_loan: emp.emergency_loan,
            notice_of_disallowance: emp.notice_of_disallowance,
            amount_received: emp.amount_received,
            lbp_savings_account_number: emp.lbp_savings_account_number,
          }));
          generatePayrollPrint({
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "payroll2": {
          const rows = employees.map((emp, i) => ({
            "#": i + 1,
            employeeName: fullName(emp.employees),
            designation: emp.designation ?? (emp.employees && getEffectivePosition(emp.employees)) ?? "",
            monthly_rate: emp.monthly_rate,
            amount_earned: emp.amount_received_2nd_half,
            amount_received: emp.amount_received_2nd_half,
            lbp_savings_account_number: emp.lbp_savings_account_number,
          }));
          generatePayrollPrint2ndHalf({
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "pera": {
          const rows = employees.map((emp) => ({
            employeeName: fullName(emp.employees),
            cmoIdNo: emp.employees?.employee_no ?? "",
            designation: emp.designation ?? (emp.employees && getEffectivePosition(emp.employees)) ?? "",
            monthly_rate: emp.monthly_rate,
            amount_earned: peraBase,
            economic_enterprise_multipurpose_coop_pera:
              emp.economic_enterprise_multipurpose_coop_pera,
            courage_2_pera_loan: emp.courage_2_pera_loan,
            net_amount_received: computeNetPeraAmount(
              emp.economic_enterprise_multipurpose_coop_pera,
              emp.courage_2_pera_loan,
              peraBase,
            ),
            lbp_savings_account_number: emp.lbp_savings_account_number,
          }));
          generatePayrollPeraPrint({
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "obr1":
        case "obr2": {
          const period: "1st Half" | "2nd Half" =
            kind === "obr1" ? "1st Half" : "2nd Half";
          const totalAmount = employees.reduce(
            (sum, e) =>
              sum +
              Number(
                kind === "obr1"
                  ? e.amount_received ?? 0
                  : e.amount_received_2nd_half ?? 0,
              ),
            0,
          );
          const firstHalfTotals =
            kind === "obr1"
              ? employees.reduce(
                  (acc, e) => {
                    const earned =
                      computeAmountEarnedFor1stHalfPrint(
                        Number(e.amount_received ?? 0),
                        e,
                      ) - getTotalDeductions(e);
                    return {
                      amount_earned:
                        acc.amount_earned +
                        computeAmountEarnedFor1stHalfPrint(
                          Number(e.amount_received ?? 0),
                          e,
                        ),
                      gsis_govt_share:
                        acc.gsis_govt_share + Number(e.gsis_govt_share ?? 0),
                      pag_ibig_govt_share:
                        acc.pag_ibig_govt_share +
                        Number(e.pag_ibig_govt_share ?? 0),
                      philhealth_govt_share:
                        acc.philhealth_govt_share +
                        Number(e.philhealth_govt_share ?? 0),
                      sif: acc.sif + Number(e.sif ?? 0),
                      _earnedRaw: acc._earnedRaw + earned,
                    };
                  },
                  {
                    amount_earned: 0,
                    gsis_govt_share: 0,
                    pag_ibig_govt_share: 0,
                    philhealth_govt_share: 0,
                    sif: 0,
                    _earnedRaw: 0,
                  },
                )
              : undefined;
          generatePayrollOBRPrint({
            particulars:
              obrParticulars ||
              (kind === "obr1"
                ? payroll.particulars ?? ""
                : payroll.particulars_2nd_half ?? ""),
            totalAmount,
            period_type: period,
            firstHalfTotals: firstHalfTotals
              ? {
                  amount_earned: firstHalfTotals.amount_earned,
                  gsis_govt_share: firstHalfTotals.gsis_govt_share,
                  pag_ibig_govt_share: firstHalfTotals.pag_ibig_govt_share,
                  philhealth_govt_share: firstHalfTotals.philhealth_govt_share,
                  sif: firstHalfTotals.sif,
                }
              : undefined,
          });
          break;
        }
        case "obrPera": {
          const totalAmount = employees.length * peraBase;
          generatePayrollOBRPrint({
            particulars: obrParticulars || `PERA for ${payroll.period_start}`,
            totalAmount,
            accountCode: "5-01-02-010",
          });
          break;
        }
        case "remit1":
        case "remit2": {
          const half = kind === "remit1" ? "1st" : "2nd";
          const rows = employees
            .filter((e) => e.lbp_savings_account_number)
            .map((emp) => ({
              employeeName: fullName(emp.employees),
              lbp_savings_account_number: emp.lbp_savings_account_number ?? "",
              amount_received:
                half === "1st"
                  ? emp.amount_received
                  : emp.amount_received_2nd_half,
            }));
          generateRemittanceListPrint({
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "remitPera": {
          const rows = employees.map((emp) => ({
            employeeName: fullName(emp.employees),
            lbp_savings_account_number: emp.lbp_savings_account_number ?? "",
            amount_received: computeNetPeraAmount(
              emp.economic_enterprise_multipurpose_coop_pera,
              emp.courage_2_pera_loan,
              peraBase,
            ),
          }));
          generateRemittanceListPrint({
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
            periodLabelOverride: `PERA — ${payroll.period_start}`,
          });
          break;
        }
        case "remitCourage2Pera": {
          const rows = employees
            .filter((e) => Number(e.courage_2_pera_loan ?? 0) > 0)
            .map((emp) => ({
              employeeName: fullName(emp.employees),
              monthly_basic_salary: emp.monthly_rate,
              monthly_amortization: Number(emp.courage_2_pera_loan ?? 0),
            }));
          generateRemittanceListAmortizationPrint({
            kind: "courage2",
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "remitEempcPera": {
          const rows = employees
            .filter(
              (e) =>
                Number(e.economic_enterprise_multipurpose_coop_pera ?? 0) > 0,
            )
            .map((emp) => ({
              employeeName: fullName(emp.employees),
              pera: Number(
                emp.economic_enterprise_multipurpose_coop_pera ?? 0,
              ),
            }));
          generateRemittanceListAmortizationPrint({
            kind: "eempc",
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
        case "sss": {
          const rows = employees
            .filter(
              (e) =>
                Number(e.ss_contribution ?? 0) +
                  Number(e.ss_contribution_ec ?? 0) >
                0,
            )
            .map((emp) => ({
              employeeName: fullName(emp.employees),
              ssNumber: null,
              seVm: "VM" as const,
              ss: Number(emp.ss_contribution ?? 0),
              ec: Number(emp.ss_contribution_ec ?? 0),
            }));
          generateRemittanceListAmortizationPrint({
            kind: "sss",
            rows,
            periodStart: payroll.period_start,
            periodEnd: payroll.period_end,
          });
          break;
        }
      }

      onOpenChange(false);
    } catch (err) {
      toast.error("Print failed");
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print</DialogTitle>
          <DialogDescription>
            Choose the document to render. Your browser print dialog will open
            and you can save as PDF.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={kind}
          onValueChange={(v) => v && setKind(v as PrintKind)}
          className="grid gap-2"
        >
          {[
            ["payroll1", "Payroll — 1st Half"],
            ["payroll2", "Payroll — 2nd Half"],
            ["pera", "PERA Payroll"],
            ["obr1", "OBR — 1st Half"],
            ["obr2", "OBR — 2nd Half"],
            ["obrPera", "OBR — PERA"],
            ["remit1", "Remittance List — 1st Half"],
            ["remit2", "Remittance List — 2nd Half"],
            ["remitPera", "Remittance List — PERA"],
            ["remitCourage2Pera", "Remittance List — COURAGE-2 PERA Loan"],
            ["remitEempcPera", "Remittance List — EEMPC (PERA)"],
            ["sss", "SSS Contribution List"],
          ].map(([value, label]) => (
            <Label
              key={value}
              className="flex items-center gap-2 rounded border px-3 py-2 cursor-pointer hover:bg-muted/50"
            >
              <RadioGroupItem value={value} />
              <span className="text-sm">{label}</span>
            </Label>
          ))}
        </RadioGroup>

        {(kind === "obr1" || kind === "obr2" || kind === "obrPera") && (
          <div className="space-y-1">
            <Label className="text-xs">Particulars override (optional)</Label>
            <Textarea
              rows={2}
              value={obrParticulars}
              onChange={(e) => setObrParticulars(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={running}>
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
