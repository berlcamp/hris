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
  jobOrderMemoDuplicateSchema,
  type JobOrderMemoDuplicateValues,
} from "@/lib/validations/job-order-memo-schema";
import { duplicateJobOrderMemo } from "@/lib/actions/job-order-memo-actions";
import type { JobOrderMemoType } from "@/lib/types";

/** The fields the duplicate modal asks for. Everything else is cloned. */
const blankDefaults: JobOrderMemoDuplicateValues = {
  subject: "",
  memo_date: "",
  memo_no: null,
  period_covered: null,
};

export interface JobOrderMemoDuplicateSource {
  id: string;
  memo_type: JobOrderMemoType;
  subject: string;
  period_covered: string | null;
}

interface JobOrderMemoDuplicateDialogProps {
  /** Non-null opens the dialog. */
  source: JobOrderMemoDuplicateSource | null;
  onOpenChange: (open: boolean) => void;
}

export function JobOrderMemoDuplicateDialog({
  source,
  onOpenChange,
}: JobOrderMemoDuplicateDialogProps) {
  const open = source !== null;
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobOrderMemoDuplicateValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderMemoDuplicateSchema) as any,
    defaultValues: blankDefaults,
  });

  // Subject and period carry over as a starting point — most duplicates are
  // the same wording for a new period. The memo NUMBER and DATE deliberately
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

  const onSubmit = async (data: JobOrderMemoDuplicateValues) => {
    if (!source) return;
    setLoading(true);
    try {
      const result = await duplicateJobOrderMemo(source.id, data);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Memo duplicated.");
      onOpenChange(false);
      router.push(`/job-orders/memos/${result.data!.id}`);
    } catch {
      toast.error("Something went wrong duplicating this memo. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate memorandum</DialogTitle>
          <DialogDescription>
            The same {source?.memo_type === "retain" ? "Retain" : "New"} template
            and the same employees, copied as they were snapshotted on the source
            memo. Give the copy its own number and date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dup_memo_no">New Memo / SO No.</Label>
              <Input
                id="dup_memo_no"
                placeholder="2026-SNGF-JO-021"
                {...register("memo_no")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup_memo_date">Date *</Label>
              <Input
                id="dup_memo_date"
                type="date"
                {...register("memo_date")}
                aria-invalid={!!errors.memo_date}
              />
              {errors.memo_date && (
                <p className="text-sm text-destructive">
                  {errors.memo_date.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup_period_covered">Period covered</Label>
            <Input
              id="dup_period_covered"
              placeholder={
                source?.memo_type === "retain"
                  ? "OCTOBER 2026 - NOVEMBER 2026"
                  : "August 1-15, 2026"
              }
              {...register("period_covered")}
            />
            <p className="text-xs text-muted-foreground">
              Printed word-for-word inside the memo’s opening sentence.
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
