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
  updateJoPayroll,
  type JoPayrollListRow,
} from "@/lib/actions/jo-payroll-actions";

interface Props {
  editData: JoPayrollListRow | null;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function JoPayrollEditModal({ editData, onOpenChange, onSuccess }: Props) {
  const open = !!editData;
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [days, setDays] = useState("");
  const [description, setDescription] = useState("");
  const [particulars, setParticulars] = useState("");
  const [payrollDate, setPayrollDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setPeriodStart(editData.period_start);
    setPeriodEnd(editData.period_end);
    setDays(editData.days != null ? String(editData.days) : "");
    setDescription(editData.description ?? "");
    setParticulars(editData.particulars ?? "");
    setPayrollDate(editData.payroll_date ?? "");
  }, [editData]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setSaving(true);
    const res = await updateJoPayroll(editData.id, {
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
    toast.success("Saved");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit JO Payroll Metadata</DialogTitle>
          <DialogDescription>
            Period, default days, description, particulars, and payroll date.
            Member changes are made from the detail view.
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
