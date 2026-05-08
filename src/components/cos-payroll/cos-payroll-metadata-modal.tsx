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
  createCosPayroll,
  updateCosPayroll,
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

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editData?: CosPayrollListRow | null;
  onSuccess?: () => void;
}

export function CosPayrollMetadataModal({
  open,
  onOpenChange,
  editData,
  onSuccess,
}: Props) {
  const [month, setMonth] = useState("");
  const [particulars, setParticulars] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
      setMonth(editData.period_start.slice(0, 7));
      setParticulars(editData.particulars ?? "");
    } else {
      setMonth(new Date().toISOString().slice(0, 7));
      setParticulars("");
    }
  }, [open, editData]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!month) {
      toast.error("Payroll month is required");
      return;
    }
    setSaving(true);
    const { start, end } = monthToRange(month);
    const payload = {
      period_start: start,
      period_end: end,
      particulars: particulars || null,
    };
    const res = editData
      ? await updateCosPayroll(editData.id, payload)
      : await createCosPayroll(payload);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editData ? "Edit COS Payroll Metadata" : "Create COS Payroll"}
          </DialogTitle>
          <DialogDescription>
            Covers the 1st to the last day of the selected month.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Payroll Month</Label>
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
              {editData ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
