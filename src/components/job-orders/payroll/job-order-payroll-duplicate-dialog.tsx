"use client";

import { useEffect, useRef, useState } from "react";
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
import { duplicateJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import { countWeekdays } from "@/lib/job-order-payroll-helpers";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const blankDefaults: JobOrderPayrollMetadataValues = {
  period_start: "",
  period_end: "",
  days: null,
  description: null,
  particulars: null,
  payroll_date: null,
};

export interface JobOrderPayrollDuplicateSource {
  id: string;
  description: string | null;
  particulars: string | null;
}

interface JobOrderPayrollDuplicateDialogProps {
  source: JobOrderPayrollDuplicateSource | null;
  onOpenChange: (open: boolean) => void;
}

export function JobOrderPayrollDuplicateDialog({
  source,
  onOpenChange,
}: JobOrderPayrollDuplicateDialogProps) {
  const open = source !== null;
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Same guard idiom as the create dialog's `days` field: flips true only on
  // a real keystroke, never on the auto-fill effect's own setValue call, so
  // a manual edit is never silently clobbered.
  const daysEditedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<JobOrderPayrollMetadataValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderPayrollMetadataSchema) as any,
    defaultValues: blankDefaults,
  });

  useEffect(() => {
    if (!source) return;
    reset({
      ...blankDefaults,
      description: source.description,
      particulars: source.particulars,
    });
    daysEditedRef.current = false;
  }, [source, reset]);

  const [periodStart, periodEnd] = watch(["period_start", "period_end"]);

  useEffect(() => {
    const validRange =
      ISO_DATE_RE.test(periodStart ?? "") &&
      ISO_DATE_RE.test(periodEnd ?? "") &&
      periodEnd >= periodStart;
    if (!validRange || daysEditedRef.current) return;
    setValue("days", countWeekdays(periodStart, periodEnd), {
      shouldValidate: true,
    });
  }, [periodStart, periodEnd, setValue]);

  const daysField = register("days", {
    onChange: () => {
      daysEditedRef.current = true;
    },
  });

  const onSubmit = async (data: JobOrderPayrollMetadataValues) => {
    if (!source) return;
    setLoading(true);
    try {
      const result = await duplicateJobOrderPayroll(source.id, data);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll duplicated.");
      onOpenChange(false);
      router.push(`/job-orders/payroll/${result.data!.id}`);
    } catch {
      toast.error(
        "Something went wrong duplicating this payroll. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate payroll</DialogTitle>
          <DialogDescription>
            Member snapshots are cloned as-is into a new draft for the period
            below. Use Refresh from roster afterward to pull current rates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dup_period_start">Period Start *</Label>
              <Input
                id="dup_period_start"
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
              <Label htmlFor="dup_period_end">Period End *</Label>
              <Input
                id="dup_period_end"
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
              <Label htmlFor="dup_days">Days</Label>
              <Input
                id="dup_days"
                type="number"
                step="1"
                min={0}
                {...daysField}
                aria-invalid={!!errors.days}
              />
              {errors.days && (
                <p className="text-sm text-destructive">{errors.days.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Auto-filled as the weekday count for the period above.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup_payroll_date">Payroll Date</Label>
              <Input
                id="dup_payroll_date"
                type="date"
                {...register("payroll_date")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup_description">Description</Label>
            <Input id="dup_description" {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup_particulars">Particulars</Label>
            <Textarea
              id="dup_particulars"
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
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
