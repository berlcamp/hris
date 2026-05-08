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
  createPayroll,
  updatePayroll,
  type PayrollListRow,
} from "@/lib/actions/payroll-actions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editData?: PayrollListRow | null;
  onSuccess?: () => void;
}

export function PayrollMetadataModal({
  open,
  onOpenChange,
  editData,
  onSuccess,
}: Props) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [particulars, setParticulars] = useState("");
  const [particulars2, setParticulars2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
      setPeriodStart(editData.period_start);
      setPeriodEnd(editData.period_end);
      setParticulars(editData.particulars ?? "");
      setParticulars2(editData.particulars_2nd_half ?? "");
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setPeriodStart(today);
      setPeriodEnd(today);
      setParticulars("");
      setParticulars2("");
    }
  }, [open, editData]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodStart || !periodEnd) {
      toast.error("Period start and end are required");
      return;
    }
    setSaving(true);
    const payload = {
      period_start: periodStart,
      period_end: periodEnd,
      particulars: particulars || null,
      particulars_2nd_half: particulars2 || null,
    };
    const res = editData
      ? await updatePayroll(editData.id, payload)
      : await createPayroll(payload);
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(editData ? "Payroll updated" : "Payroll created");
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editData ? "Edit Payroll Metadata" : "Create Payroll"}
          </DialogTitle>
          <DialogDescription>
            Define the period and printable particulars. Add employees from the
            detail view after creating.
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

          <div className="space-y-1">
            <Label>Particulars (1st Half)</Label>
            <Textarea
              rows={3}
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Particulars (2nd Half)</Label>
            <Textarea
              rows={3}
              value={particulars2}
              onChange={(e) => setParticulars2(e.target.value)}
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
              {editData ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
