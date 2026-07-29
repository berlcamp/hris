"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  jobOrderPayrollMetadataSchema,
  type JobOrderPayrollMetadataValues,
} from "@/lib/validations/job-order-payroll-schema";
import { updateJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import type { JobOrderPayroll } from "@/lib/types";

interface JobOrderPayrollEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payroll: JobOrderPayroll;
}

function defaultsFor(
  payroll: JobOrderPayroll,
): JobOrderPayrollMetadataValues {
  return {
    period_start: payroll.period_start,
    period_end: payroll.period_end,
    days: payroll.days,
    description: payroll.description,
    particulars: payroll.particulars,
    payroll_date: payroll.payroll_date,
  };
}

export function JobOrderPayrollEditDialog({
  open,
  onOpenChange,
  payroll,
}: JobOrderPayrollEditDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobOrderPayrollMetadataValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderPayrollMetadataSchema) as any,
    defaultValues: defaultsFor(payroll),
  });

  // Re-seed the form from the latest payroll every time the dialog opens, so
  // a previous edit session (or a stale snapshot from before a
  // router.refresh()) never leaks into the next time it's opened.
  useEffect(() => {
    if (!open) return;
    reset(defaultsFor(payroll));
  }, [open, payroll, reset]);

  const onSubmit = async (data: JobOrderPayrollMetadataValues) => {
    setLoading(true);
    try {
      const result = await updateJobOrderPayroll(payroll.id, data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll updated.");
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong updating this payroll. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit payroll details</DialogTitle>
          <DialogDescription>
            Update the period and metadata. Members are unaffected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit_period_start">Period Start *</Label>
              <Input
                id="edit_period_start"
                type="date"
                {...register("period_start")}
                aria-invalid={!!errors.period_start}
              />
              {errors.period_start && (
                <p className="text-sm text-destructive">
                  {errors.period_start.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_period_end">Period End *</Label>
              <Input
                id="edit_period_end"
                type="date"
                {...register("period_end")}
                aria-invalid={!!errors.period_end}
              />
              {errors.period_end && (
                <p className="text-sm text-destructive">
                  {errors.period_end.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit_days">Days</Label>
              <Input
                id="edit_days"
                type="number"
                step="1"
                min={0}
                {...register("days")}
                aria-invalid={!!errors.days}
              />
              {errors.days && (
                <p className="text-sm text-destructive">{errors.days.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_payroll_date">Payroll Date</Label>
              <Input
                id="edit_payroll_date"
                type="date"
                {...register("payroll_date")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_description">Description</Label>
            <Input id="edit_description" {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_particulars">Particulars</Label>
            <Textarea
              id="edit_particulars"
              rows={2}
              {...register("particulars")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
