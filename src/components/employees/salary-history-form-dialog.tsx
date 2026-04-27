"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSalaryHistoryRecord,
  updateSalaryHistoryRecord,
} from "@/lib/actions/employee-actions";
import { getSalaryAmount } from "@/lib/actions/nosi-actions";
import { SALARY_CHANGE_REASONS } from "@/lib/constants";
import type { SalaryChangeReason, SalaryHistory } from "@/lib/types";

const ALL_SALARY_REASONS = [
  SALARY_CHANGE_REASONS.INITIAL,
  SALARY_CHANGE_REASONS.STEP_INCREMENT,
  SALARY_CHANGE_REASONS.PROMOTION,
  SALARY_CHANGE_REASONS.RECLASSIFICATION,
  SALARY_CHANGE_REASONS.SALARY_STANDARDIZATION,
  SALARY_CHANGE_REASONS.ADJUSTMENT,
  SALARY_CHANGE_REASONS.DEMOTION,
] as const;

const reasonLabels: Record<SalaryChangeReason, string> = {
  initial: "Initial (original appointment / baseline)",
  step_increment: "Step increment (incl. prior NOSI)",
  promotion: "Promotion",
  reclassification: "Reclassification",
  salary_standardization: "Salary standardization",
  adjustment: "Adjustment",
  demotion: "Demotion",
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

interface SalaryHistoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  defaultSalaryGrade: number;
  defaultStep: number;
  /** When set, dialog updates this record; when null, creates a new one. */
  record: SalaryHistory | null;
}

function SalaryHistoryFormDialogInner({
  onOpenChange,
  employeeId,
  defaultSalaryGrade,
  defaultStep,
  record,
}: Omit<SalaryHistoryFormDialogProps, "open">) {
  const router = useRouter();
  const isEdit = record != null;
  const [loading, setLoading] = useState(false);
  const [fetchingAmount, setFetchingAmount] = useState(false);
  const [reason, setReason] = useState<SalaryChangeReason>(
    () => record?.reason ?? "step_increment"
  );
  const [effectiveDate, setEffectiveDate] = useState(
    () => (record ? record.effective_date.slice(0, 10) : todayISODate())
  );
  const [salaryGrade, setSalaryGrade] = useState(
    () => String(record?.salary_grade ?? defaultSalaryGrade)
  );
  const [step, setStep] = useState(
    () => String(record?.step ?? defaultStep)
  );
  const [salaryAmount, setSalaryAmount] = useState(
    () => String(record?.salary_amount ?? 0)
  );
  const [remarks, setRemarks] = useState(() => record?.remarks ?? "");
  const skipNextAmountFromTable = useRef(!!record);

  useEffect(() => {
    const g = Number(salaryGrade);
    const s = Number(step);
    if (!Number.isFinite(g) || !Number.isFinite(s)) return;
    if (skipNextAmountFromTable.current) {
      skipNextAmountFromTable.current = false;
      return;
    }
    let cancelled = false;
    // show spinner while SSL amount loads (async side effect, not a sync "adjustment" to props)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch lifecycle
    setFetchingAmount(true);
    getSalaryAmount(g, s)
      .then((amt) => {
        if (!cancelled) setSalaryAmount(String(amt));
      })
      .finally(() => {
        if (!cancelled) setFetchingAmount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salaryGrade, step]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = {
      employee_id: employeeId,
      salary_grade: Number(salaryGrade),
      step: Number(step),
      salary_amount: Number(salaryAmount) || 0,
      effective_date: effectiveDate,
      reason,
      remarks: remarks.trim() || null,
    };
    if (isEdit && record) {
      const res = await updateSalaryHistoryRecord({
        id: record.id,
        ...body,
      });
      setLoading(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Salary history updated.");
    } else {
      const res = await addSalaryHistoryRecord(body);
      setLoading(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Salary history record added.");
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit salary history" : "Add salary history"}
          </DialogTitle>
          <DialogDescription>
            The effective date (latest row wins) sets the NOSI eligibility
            clock. Use initial for original appointment or migration baseline.
            {isEdit && record?.reference_id != null
              ? " This row is linked to a NOSI/NOSA document; the link is unchanged if you edit it here."
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="sh-effective">Effective date</Label>
            <Input
              id="sh-effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as SalaryChangeReason)}
              itemToStringLabel={(v) => reasonLabels[String(v) as SalaryChangeReason] ?? String(v)}
            >
              <SelectTrigger className="h-auto min-h-8 w-full max-w-full py-1.5 whitespace-normal">
                <SelectValue className="line-clamp-none text-left" />
              </SelectTrigger>
              <SelectContent>
                {ALL_SALARY_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {reasonLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sh-sg">Salary grade</Label>
              <Input
                id="sh-sg"
                type="number"
                min={1}
                max={33}
                value={salaryGrade}
                onChange={(e) => setSalaryGrade(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sh-step">Step</Label>
              <Input
                id="sh-step"
                type="number"
                min={1}
                max={8}
                value={step}
                onChange={(e) => setStep(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-amt">Salary amount (₱)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="sh-amt"
                type="number"
                min={0}
                step="0.01"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
              />
              {fetchingAmount && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-remarks">Remarks (optional)</Label>
            <Textarea
              id="sh-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Migrated: last NOSI effectivity …"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function SalaryHistoryFormDialog({
  open,
  onOpenChange,
  employeeId,
  defaultSalaryGrade,
  defaultStep,
  record,
}: SalaryHistoryFormDialogProps) {
  const formKey = record ? record.id : "add";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SalaryHistoryFormDialogInner
          key={formKey}
          onOpenChange={onOpenChange}
          employeeId={employeeId}
          defaultSalaryGrade={defaultSalaryGrade}
          defaultStep={defaultStep}
          record={record}
        />
      )}
    </Dialog>
  );
}
