"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adjustLeaveCredit } from "@/lib/actions/leave-actions";
import type { LeaveTypeRow } from "@/lib/actions/leave-actions";

interface LeaveCreditAdjustmentDialogProps {
  employeeId: string;
  employeeName: string;
  leaveTypes: LeaveTypeRow[];
  year: number;
  // When provided, the leave-type dropdown is hidden and the dialog acts on
  // this single type. Use this when the trigger lives next to a specific
  // leave-type card (e.g. the VL card on the employee profile tab).
  fixedLeaveType?: { id: string; code: string; name: string };
  trigger?: React.ReactNode;
}

export function LeaveCreditAdjustmentDialog({
  employeeId,
  employeeName,
  leaveTypes,
  year,
  fixedLeaveType,
  trigger,
}: LeaveCreditAdjustmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState(fixedLeaveType?.id ?? "");
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    if (!leaveTypeId || !adjustment || !reason.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    setLoading(true);
    const result = await adjustLeaveCredit({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      adjustment: Number(adjustment),
      reason: reason.trim(),
    });
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Leave credit adjusted successfully.");
      setOpen(false);
      setLeaveTypeId(fixedLeaveType?.id ?? "");
      setAdjustment("");
      setReason("");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={trigger ?? <Button variant="outline" size="sm" />}
      >
        {trigger ? undefined : "Adjust Credits"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {fixedLeaveType
              ? `Adjust ${fixedLeaveType.name} (${fixedLeaveType.code})`
              : "Adjust Leave Credits"}
          </DialogTitle>
          <DialogDescription>
            Manually adjust leave credits for {employeeName} ({year}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!fixedLeaveType && (
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select
                value={leaveTypeId}
                items={leaveTypes.map((lt) => ({ value: lt.id, label: `${lt.name} (${lt.code})` }))}
                onValueChange={(v) => setLeaveTypeId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id} label={`${lt.name} (${lt.code})`}>
                      {lt.name} ({lt.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Adjustment (+ to add, - to deduct)</Label>
            <Input
              type="number"
              step="0.5"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="e.g. 5 or -2.5"
            />
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for adjustment..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !leaveTypeId || !adjustment || !reason.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
