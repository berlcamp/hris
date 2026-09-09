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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  jobOrderSpecialOrderDuplicateSchema,
  type JobOrderSpecialOrderDuplicateValues,
} from "@/lib/validations/job-order-special-order-schema";
import { duplicateJobOrderSpecialOrder } from "@/lib/actions/job-order-special-order-actions";

/** The fields the duplicate modal asks for. Everything else is cloned. */
const blankDefaults: JobOrderSpecialOrderDuplicateValues = {
  subject: "",
  so_date: "",
  so_no: null,
  period_covered: null,
};

export interface JobOrderSpecialOrderDuplicateSource {
  id: string;
  subject: string;
  period_covered: string | null;
}

interface JobOrderSpecialOrderDuplicateDialogProps {
  /** Non-null opens the dialog. */
  source: JobOrderSpecialOrderDuplicateSource | null;
  onOpenChange: (open: boolean) => void;
}

export function JobOrderSpecialOrderDuplicateDialog({
  source,
  onOpenChange,
}: JobOrderSpecialOrderDuplicateDialogProps) {
  const open = source !== null;
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobOrderSpecialOrderDuplicateValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderSpecialOrderDuplicateSchema) as any,
    defaultValues: blankDefaults,
  });

  // Subject and effectivity carry over as a starting point — most duplicates
  // are the same wording for a new period. The SO NUMBER and DATE deliberately
  // start blank: reusing either would produce two documents claiming to be the
  // same paper.
  useEffect(() => {
    if (!source) return;
    reset({
      ...blankDefaults,
      subject: source.subject,
      period_covered: source.period_covered,
    });
  }, [source, reset]);

  const onSubmit = async (data: JobOrderSpecialOrderDuplicateValues) => {
    if (!source) return;
    setLoading(true);
    try {
      const result = await duplicateJobOrderSpecialOrder(source.id, data);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Special order duplicated.");
      onOpenChange(false);
      router.push(`/job-orders/special-orders/${result.data!.id}`);
    } catch {
      toast.error(
        "Something went wrong duplicating this special order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate special order</DialogTitle>
          <DialogDescription>
            The same personnel, copied as they were snapshotted on the source
            order. Give the copy its own number and date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dup_so_no">New SO No.</Label>
              <Input
                id="dup_so_no"
                placeholder="2025-AHFO-SO-053"
                {...register("so_no")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup_so_date">Date *</Label>
              <Input
                id="dup_so_date"
                type="date"
                {...register("so_date")}
                aria-invalid={!!errors.so_date}
              />
              {errors.so_date && (
                <p className="text-sm text-destructive">
                  {errors.so_date.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup_period_covered">Effective</Label>
            <Input
              id="dup_period_covered"
              placeholder="JULY 2025"
              {...register("period_covered")}
            />
            <p className="text-xs text-muted-foreground">
              Printed word-for-word inside the order’s opening sentence.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup_subject">Subject *</Label>
            <Input
              id="dup_subject"
              {...register("subject")}
              aria-invalid={!!errors.subject}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
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
