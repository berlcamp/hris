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
  duplicateJoPayroll,
  type JoPayrollListRow,
} from "@/lib/actions/jo-payroll-actions";

function nextRange(periodEnd: string): { start: string; end: string } {
  const d = new Date(periodEnd);
  const startD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const endD = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  return {
    start: startD.toISOString().slice(0, 10),
    end: endD.toISOString().slice(0, 10),
  };
}

interface Props {
  source: JoPayrollListRow | null;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function JoPayrollDuplicateModal({
  source,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = !!source;
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [days, setDays] = useState("");
  const [description, setDescription] = useState("");
  const [particulars, setParticulars] = useState("");
  const [payrollDate, setPayrollDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!source) return;
    const { start, end } = nextRange(source.period_end);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setPeriodStart(start);
    setPeriodEnd(end);
    setDays(source.days != null ? String(source.days) : "");
    setDescription(source.description ? source.description + " (copy)" : "");
    setParticulars(source.particulars ?? "");
    setPayrollDate("");
  }, [source]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return;
    setSaving(true);
    const res = await duplicateJoPayroll(source.id, {
      period_start: periodStart,
      period_end: periodEnd,
      description: description || null,
      particulars: particulars || null,
      days: days ? Number(days) : null,
      payroll_date: payrollDate || null,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate JO Payroll</DialogTitle>
          <DialogDescription>
            Members and snapshotted rates are copied. Hours are reset.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default Days</Label>
              <Input
                type="number"
                step="0.5"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Payroll Date</Label>
              <Input
                type="date"
                value={payrollDate}
                onChange={(e) => setPayrollDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
