"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  jobOrderPayrollCreateSchema,
  type JobOrderPayrollCreateValues,
} from "@/lib/validations/job-order-payroll-schema";
import { createJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import { getHolidaysInRange, type HolidayInRange } from "@/lib/actions/holiday-actions";
import { countWeekdays } from "@/lib/job-order-payroll-helpers";
import type { JobOrderAreaOption } from "@/lib/types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const blankDefaults: JobOrderPayrollCreateValues = {
  period_start: "",
  period_end: "",
  days: null,
  description: null,
  particulars: null,
  payroll_date: null,
  area_ids: [],
};

interface JobOrderPayrollCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: JobOrderAreaOption[];
}

export function JobOrderPayrollCreateDialog({
  open,
  onOpenChange,
  areas,
}: JobOrderPayrollCreateDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [holidays, setHolidays] = useState<HolidayInRange[]>([]);

  // Flipped true the moment the user types into the `days` field directly.
  // Once true, the period-change effect below must never call setValue on
  // `days` again — that would silently clobber a deliberate manual value.
  const daysEditedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<JobOrderPayrollCreateValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderPayrollCreateSchema) as any,
    defaultValues: blankDefaults,
  });

  // Reset all local state whenever the dialog is (re)opened, so a previous
  // draft (or a previously flipped "manually edited" guard) never leaks into
  // the next time the user opens this dialog.
  useEffect(() => {
    if (!open) return;
    reset(blankDefaults);
    daysEditedRef.current = false;
    setHolidays([]);
  }, [open, reset]);

  const [periodStart, periodEnd] = watch(["period_start", "period_end"]);
  const areaIds = watch("area_ids") ?? [];

  useEffect(() => {
    const validRange =
      ISO_DATE_RE.test(periodStart ?? "") &&
      ISO_DATE_RE.test(periodEnd ?? "") &&
      periodEnd >= periodStart;

    if (!validRange) {
      setHolidays([]);
      return;
    }

    if (!daysEditedRef.current) {
      setValue("days", countWeekdays(periodStart, periodEnd), {
        shouldValidate: true,
      });
    }

    let cancelled = false;
    getHolidaysInRange(periodStart, periodEnd)
      .then((rows) => {
        if (!cancelled) setHolidays(rows);
      })
      .catch(() => {
        // Advisory only — a lookup failure should not block filling out
        // the rest of the form.
      });
    return () => {
      cancelled = true;
    };
  }, [periodStart, periodEnd, setValue]);

  const daysField = register("days", {
    onChange: () => {
      daysEditedRef.current = true;
    },
  });

  const toggleArea = (areaId: string, checked: boolean) => {
    const current = getValues("area_ids") ?? [];
    const next = checked
      ? [...current, areaId]
      : current.filter((id) => id !== areaId);
    setValue("area_ids", next, { shouldValidate: true });
  };

  const totalMembers = areas
    .filter((a) => areaIds.includes(a.id))
    .reduce((sum, a) => sum + a.active_employee_count, 0);

  const onSubmit = async (data: JobOrderPayrollCreateValues) => {
    setLoading(true);
    try {
      const result = await createJobOrderPayroll(data);

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Payroll created.");
      onOpenChange(false);
      router.push(`/job-orders/payroll/${result.data!.id}`);
    } catch {
      // createJobOrderPayroll can throw (e.g. loadJobOrdersForSnapshot's
      // `if (error) throw error;` on a Supabase read failure) instead of
      // returning `{ error }`. Without this, `loading` would never reset —
      // the dialog is gated shut while loading (see `onOpenChange` above and
      // the Cancel button below), so an unhandled rejection here traps the
      // user in an unclosable modal with no explanation.
      toast.error("Something went wrong creating the payroll. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="!max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Job Order Payroll</DialogTitle>
          <DialogDescription>
            Pick a period and one or more areas. Every active Job Order
            employee in those areas is added automatically with a frozen
            snapshot of their pay details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="period_start">Period Start *</Label>
              <Input
                id="period_start"
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
              <Label htmlFor="period_end">Period End *</Label>
              <Input
                id="period_end"
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
              <Label htmlFor="days">Days</Label>
              <Input
                id="days"
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
                Auto-filled as the weekday count for the period above. Edit it
                and it stays exactly as you left it.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll_date">Payroll Date</Label>
              <Input
                id="payroll_date"
                type="date"
                {...register("payroll_date")}
              />
            </div>
          </div>

          {holidays.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1 font-medium text-foreground">
                <Info className="h-3.5 w-3.5" />
                {`ⓘ ${holidays.length} holidays in this period:`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {holidays.map((h) => (
                  <li key={h.date}>
                    {format(new Date(`${h.date}T00:00:00`), "MMM d")} —{" "}
                    {h.name} ({h.type})
                  </li>
                ))}
              </ul>
              <p className="mt-1">Not deducted automatically.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="particulars">Particulars</Label>
            <Textarea id="particulars" rows={2} {...register("particulars")} />
          </div>

          <div className="space-y-2">
            <Label>Areas *</Label>
            <ScrollArea className="h-48 rounded-md border p-2">
              <div className="space-y-1">
                {areas.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">
                    No active areas found.
                  </p>
                )}
                {areas.map((a) => {
                  const checked = areaIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleArea(a.id, !!c)}
                      />
                      <span>
                        {a.name} ({a.active_employee_count})
                      </span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
            {errors.area_ids && (
              <p className="text-sm text-destructive">
                {errors.area_ids.message}
              </p>
            )}
            <p className="text-sm font-medium">→ {totalMembers} members</p>
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
            <Button type="submit" disabled={loading || totalMembers === 0}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Payroll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
