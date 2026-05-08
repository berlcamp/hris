"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  duplicateCosPayroll,
  type CosPayrollListRow,
} from "@/lib/actions/cos-payroll-actions";

function monthToRange(monthValue: string): { start: string; end: string } {
  const [yearStr, monthStr] = monthValue.split("-");
  const y = Number(yearStr);
  const m = Number(monthStr);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function nextMonthYM(periodEnd: string): string {
  const d = new Date(periodEnd);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

interface Props {
  source: CosPayrollListRow | null;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function CosPayrollDuplicateModal({
  source,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = !!source;
  const [month, setMonth] = useState("");
  const [particulars, setParticulars] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!source) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setMonth(nextMonthYM(source.period_end));
    setParticulars(source.particulars ?? "");
  }, [source]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return;
    setSaving(true);
    const { start, end } = monthToRange(month);
    const res = await duplicateCosPayroll(source.id, {
      period_start: start,
      period_end: end,
      particulars: particulars || null,
    });
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Payroll duplicated");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate COS Payroll</DialogTitle>
          <DialogDescription>
            Employee rows are copied. Absent w/o pay resets to zero; SSS and
            monthly rate carry over.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Target Month</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Particulars</Label>
            <Textarea
              rows={3}
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
            />
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
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
