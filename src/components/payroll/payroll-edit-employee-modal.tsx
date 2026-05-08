"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateEmployeePayroll,
  type EmployeePayrollWithEmployee,
} from "@/lib/actions/payroll-actions";
import {
  calculatePayrollAmounts,
  totalSsDeduction,
} from "@/lib/utils/payrollAmountCalc";
import {
  computeNetPeraAmount,
  getPeraMonthlyAmountFromEnv,
} from "@/lib/utils/peraAmount";

type FormState = {
  designation: string;
  monthly_rate: string;
  sif: string;
  withholding_tax: string;
  philhealth_personal_share: string;
  philhealth_govt_share: string;
  gsis_personal_share: string;
  gsis_govt_share: string;
  pag_ibig_personal_share: string;
  pag_ibig_govt_share: string;
  hmdf: string;
  pag_ibig_salary_loan: string;
  ss_contribution: string;
  ss_contribution_ec: string;
  gsis_repayments_mpl: string;
  gsis_repayments_mpl_lite: string;
  gsis_repayments_policy_loan: string;
  gsis_repayments_cpl: string;
  courage_2_contribution: string;
  courage_salary_loan: string;
  economic_enterprise_multipurpose_coop: string;
  eempc_salary_loan: string;
  emergency_loan: string;
  notice_of_disallowance: string;
  economic_enterprise_multipurpose_coop_pera: string;
  courage_2_pera_loan: string;
  lbp_savings_account_number: string;
};

const NUM_FIELDS = [
  "monthly_rate",
  "sif",
  "withholding_tax",
  "philhealth_personal_share",
  "philhealth_govt_share",
  "gsis_personal_share",
  "gsis_govt_share",
  "pag_ibig_personal_share",
  "pag_ibig_govt_share",
  "hmdf",
  "pag_ibig_salary_loan",
  "ss_contribution",
  "ss_contribution_ec",
  "gsis_repayments_mpl",
  "gsis_repayments_mpl_lite",
  "gsis_repayments_policy_loan",
  "gsis_repayments_cpl",
  "courage_2_contribution",
  "courage_salary_loan",
  "economic_enterprise_multipurpose_coop",
  "eempc_salary_loan",
  "emergency_loan",
  "notice_of_disallowance",
  "economic_enterprise_multipurpose_coop_pera",
  "courage_2_pera_loan",
] as const;

function emptyForm(): FormState {
  const f: Partial<FormState> = {};
  for (const k of NUM_FIELDS) f[k] = "";
  f.designation = "";
  f.lbp_savings_account_number = "";
  return f as FormState;
}

function toN(v: string): number | null {
  if (v === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Section {
  title: string;
  fields: { key: keyof FormState; label: string }[];
}

const SECTIONS: Section[] = [
  {
    title: "Employee",
    fields: [{ key: "designation", label: "Designation" }],
  },
  {
    title: "Earnings",
    fields: [{ key: "monthly_rate", label: "Monthly Rate" }],
  },
  {
    title: "Taxes",
    fields: [
      { key: "withholding_tax", label: "Withholding Tax" },
      { key: "sif", label: "SIF" },
    ],
  },
  {
    title: "PhilHealth",
    fields: [
      { key: "philhealth_personal_share", label: "Personal Share" },
      { key: "philhealth_govt_share", label: "Gov't Share" },
    ],
  },
  {
    title: "GSIS",
    fields: [
      { key: "gsis_personal_share", label: "Personal Share" },
      { key: "gsis_govt_share", label: "Gov't Share" },
      { key: "gsis_repayments_mpl", label: "MPL Repayment" },
      { key: "gsis_repayments_mpl_lite", label: "MPL-LITE Repayment" },
      { key: "gsis_repayments_policy_loan", label: "Policy Loan" },
      { key: "gsis_repayments_cpl", label: "CPL Repayment" },
    ],
  },
  {
    title: "Pag-IBIG",
    fields: [
      { key: "pag_ibig_personal_share", label: "Personal Share" },
      { key: "pag_ibig_govt_share", label: "Gov't Share" },
      { key: "hmdf", label: "HDMF" },
      { key: "pag_ibig_salary_loan", label: "Salary Loan" },
    ],
  },
  {
    title: "Other Deductions",
    fields: [
      { key: "ss_contribution", label: "SS Contribution (SS)" },
      { key: "ss_contribution_ec", label: "SS Contribution (EC)" },
      { key: "courage_2_contribution", label: "COURAGE 2 Contribution" },
      { key: "courage_salary_loan", label: "COURAGE Salary Loan" },
      { key: "economic_enterprise_multipurpose_coop", label: "EEMPC Coop" },
      { key: "eempc_salary_loan", label: "EEMPC Salary Loan" },
      { key: "emergency_loan", label: "Emergency Loan" },
      { key: "notice_of_disallowance", label: "Notice of Disallowance" },
    ],
  },
  {
    title: "PERA Deductions",
    fields: [
      {
        key: "economic_enterprise_multipurpose_coop_pera",
        label: "EEMPC (PERA)",
      },
      { key: "courage_2_pera_loan", label: "COURAGE-2 PERA Loan" },
    ],
  },
];

interface Props {
  target: EmployeePayrollWithEmployee | null;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function PayrollEditEmployeeModal({ target, onOpenChange, onSuccess }: Props) {
  const open = !!target;
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const f: FormState = emptyForm();
    f.designation = target.designation ?? "";
    f.lbp_savings_account_number = target.lbp_savings_account_number ?? "";
    for (const k of NUM_FIELDS) {
      const v = target[k as keyof EmployeePayrollWithEmployee];
      f[k] = v != null ? String(v) : "";
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setForm(f);
  }, [target]);

  const computed = useMemo(() => {
    const numeric = Object.fromEntries(
      NUM_FIELDS.map((k) => [k, toN(form[k])]),
    ) as Record<(typeof NUM_FIELDS)[number], number | null>;
    return calculatePayrollAmounts({
      monthly_rate: numeric.monthly_rate,
      withholding_tax: numeric.withholding_tax,
      philhealth_personal_share: numeric.philhealth_personal_share,
      gsis_personal_share: numeric.gsis_personal_share,
      pag_ibig_personal_share: numeric.pag_ibig_personal_share,
      hmdf: numeric.hmdf,
      pag_ibig_salary_loan: numeric.pag_ibig_salary_loan,
      ss_contribution: numeric.ss_contribution,
      ss_contribution_ec: numeric.ss_contribution_ec,
      gsis_repayments_mpl: numeric.gsis_repayments_mpl,
      gsis_repayments_mpl_lite: numeric.gsis_repayments_mpl_lite,
      gsis_repayments_policy_loan: numeric.gsis_repayments_policy_loan,
      gsis_repayments_cpl: numeric.gsis_repayments_cpl,
      courage_2_contribution: numeric.courage_2_contribution,
      courage_salary_loan: numeric.courage_salary_loan,
      economic_enterprise_multipurpose_coop:
        numeric.economic_enterprise_multipurpose_coop,
      eempc_salary_loan: numeric.eempc_salary_loan,
      emergency_loan: numeric.emergency_loan,
      notice_of_disallowance: numeric.notice_of_disallowance,
    });
  }, [form]);

  const peraNet = computeNetPeraAmount(
    toN(form.economic_enterprise_multipurpose_coop_pera),
    toN(form.courage_2_pera_loan),
  );
  const peraBase = getPeraMonthlyAmountFromEnv();

  const ssTotal = totalSsDeduction(
    toN(form.ss_contribution),
    toN(form.ss_contribution_ec),
  );

  const handleField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    const payload = {
      designation: form.designation || null,
      lbp_savings_account_number: form.lbp_savings_account_number || null,
      ...(Object.fromEntries(
        NUM_FIELDS.map((k) => [k, toN(form[k])]),
      ) as Record<(typeof NUM_FIELDS)[number], number | null>),
    };
    const res = await updateEmployeePayroll(target.id, payload);
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit{" "}
            {target?.employees
              ? `${target.employees.last_name}, ${target.employees.first_name}`
              : "Employee Payroll"}
          </DialogTitle>
          <DialogDescription>
            Net pay is recomputed automatically from monthly rate minus all
            non-PERA deductions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {section.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={form[f.key]}
                      type={f.key === "designation" ? "text" : "number"}
                      step={f.key === "designation" ? undefined : "0.01"}
                      onChange={(e) => handleField(f.key, e.target.value)}
                    />
                  </div>
                ))}
                {section.title === "Other Deductions" && (
                  <div className="col-span-2 text-xs text-muted-foreground">
                    Total SS deduction (SS + EC): ₱{fmt(ssTotal)}
                  </div>
                )}
                {section.title === "PERA Deductions" && (
                  <div className="col-span-2 text-xs text-muted-foreground">
                    PERA base ₱{fmt(peraBase)} → Net PERA: ₱{fmt(peraNet)}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Net Pay & Payout
            </div>
            <div className="grid grid-cols-2 gap-3 bg-primary/5 border rounded-lg p-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  Amount Received (1st Half)
                </div>
                <div className="text-lg font-mono font-bold">
                  ₱{fmt(computed?.amount_received ?? null)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Amount Received (2nd Half)
                </div>
                <div className="text-lg font-mono font-bold">
                  ₱{fmt(computed?.amount_received_2nd_half ?? null)}
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">LBP Savings Account</Label>
                <Input
                  value={form.lbp_savings_account_number}
                  onChange={(e) =>
                    handleField("lbp_savings_account_number", e.target.value)
                  }
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
