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
  updateCosEmployeePayroll,
  type CosEmployeePayrollWithEmployee,
} from "@/lib/actions/cos-payroll-actions";
import {
  computeCosEwt,
  computeCosNetAmount,
  computeCosNetSalary,
} from "@/lib/utils/cosPayrollAmount";

function toN(v: string): number | null {
  if (v === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  target: CosEmployeePayrollWithEmployee | null;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function CosPayrollEditEmployeeModal({
  target,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = !!target;
  const [designation, setDesignation] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [absent, setAbsent] = useState("");
  const [ss, setSs] = useState("");
  const [ec, setEc] = useState("");
  const [tax3, setTax3] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setDesignation(target.designation ?? "");
    setMonthlyRate(target.monthly_rate != null ? String(target.monthly_rate) : "");
    setAbsent(
      target.absent_without_pay != null ? String(target.absent_without_pay) : "",
    );
    setSs(target.ss_contribution != null ? String(target.ss_contribution) : "");
    setEc(
      target.ss_contribution_ec != null ? String(target.ss_contribution_ec) : "",
    );
    setTax3(
      target.percentage_tax_3 != null ? String(target.percentage_tax_3) : "",
    );
  }, [target]);

  const ewt = useMemo(
    () => computeCosEwt(toN(monthlyRate), toN(absent)),
    [monthlyRate, absent],
  );
  const netSalary = useMemo(
    () => computeCosNetSalary(toN(monthlyRate), toN(absent)),
    [monthlyRate, absent],
  );
  const net = useMemo(
    () =>
      computeCosNetAmount({
        monthly_rate: toN(monthlyRate),
        absent_without_pay: toN(absent),
        ss_contribution: toN(ss),
        ss_contribution_ec: toN(ec),
        percentage_tax_3: toN(tax3),
      }),
    [monthlyRate, absent, ss, ec, tax3],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    const res = await updateCosEmployeePayroll(target.id, {
      designation: designation || null,
      monthly_rate: toN(monthlyRate),
      absent_without_pay: toN(absent),
      ss_contribution: toN(ss),
      ss_contribution_ec: toN(ec),
      percentage_tax_3: toN(tax3),
    });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit{" "}
            {target?.employees
              ? `${target.employees.last_name}, ${target.employees.first_name}`
              : "COS Employee"}
          </DialogTitle>
          <DialogDescription>
            Net = (Monthly − Absent) − 5% EWT − SS − EC − Percentage Tax 3%.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Designation</Label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Monthly Salary</Label>
              <Input
                type="number"
                step="0.01"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Absent without pay</Label>
              <Input
                type="number"
                step="0.01"
                value={absent}
                onChange={(e) => setAbsent(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">EWT (5%)</div>
              <div className="font-mono">₱{fmt(ewt)}</div>
            </div>
            <div className="rounded border bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">Net Salary</div>
              <div className="font-mono">₱{fmt(netSalary)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">SSS (SS)</Label>
              <Input
                type="number"
                step="0.01"
                value={ss}
                onChange={(e) => setSs(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SSS (EC)</Label>
              <Input
                type="number"
                step="0.01"
                value={ec}
                onChange={(e) => setEc(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Percentage Tax 3%</Label>
              <Input
                type="number"
                step="0.01"
                value={tax3}
                onChange={(e) => setTax3(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded border bg-primary/5 px-3 py-3">
            <div className="text-xs text-muted-foreground">
              Net Amount Received
            </div>
            <div className="text-2xl font-mono font-bold">₱{fmt(net)}</div>
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
