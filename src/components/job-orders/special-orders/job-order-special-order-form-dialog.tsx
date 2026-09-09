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
  jobOrderSpecialOrderCreateSchema,
  jobOrderSpecialOrderMetadataSchema,
  type JobOrderSpecialOrderCreateValues,
} from "@/lib/validations/job-order-special-order-schema";
import {
  createJobOrderSpecialOrder,
  getJobOrdersForSpecialOrderPicker,
  updateJobOrderSpecialOrder,
} from "@/lib/actions/job-order-special-order-actions";
import type {
  JobOrderSpecialOrder,
  JobOrderSpecialOrderPickerOption,
} from "@/lib/types";

/**
 * The subject nearly every Special Order in this series is issued under —
 * prefilled on a new order and freely overwritten. Unlike the memorandum's
 * per-template default there is only one, so it is a plain initial value with
 * no "has the user typed?" guard to keep in sync.
 */
const DEFAULT_SUBJECT = "RENDITION OF ADDITIONAL TIME SERVICES";

const blankDefaults: JobOrderSpecialOrderCreateValues = {
  subject: DEFAULT_SUBJECT,
  so_date: "",
  so_no: null,
  period_covered: null,
  employee_ids: [],
};

interface JobOrderSpecialOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Null creates a new special order (with the employee picker); an order
   * edits its header fields only — membership is managed on the detail page.
   */
  specialOrder: JobOrderSpecialOrder | null;
}

export function JobOrderSpecialOrderFormDialog({
  open,
  onOpenChange,
  specialOrder,
}: JobOrderSpecialOrderFormDialogProps) {
  const router = useRouter();
  const isEdit = specialOrder !== null;

  const [loading, setLoading] = useState(false);
  const [roster, setRoster] = useState<JobOrderSpecialOrderPickerOption[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<JobOrderSpecialOrderCreateValues>({
    // The create schema is a superset of the edit one; in edit mode the
    // employee_ids array is not rendered, so it is validated against the
    // metadata schema instead of demanding a selection that has no field.
    resolver: zodResolver(
      isEdit
        ? jobOrderSpecialOrderMetadataSchema
        : jobOrderSpecialOrderCreateSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any,
    defaultValues: blankDefaults,
  });

  // Reset every time the dialog opens so a previous draft never leaks into the
  // next open.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    if (specialOrder) {
      reset({
        subject: specialOrder.subject,
        so_date: specialOrder.so_date,
        so_no: specialOrder.so_no,
        period_covered: specialOrder.period_covered,
        employee_ids: [],
      });
    } else {
      reset(blankDefaults);
    }
  }, [open, specialOrder, reset]);

  // The roster is only needed by the create form's picker.
  useEffect(() => {
    if (!open || isEdit) return;
    setRosterLoading(true);
    getJobOrdersForSpecialOrderPicker()
      .then(setRoster)
      .catch(() => {
        toast.error("Failed to load Job Order employees.");
        setRoster([]);
      })
      .finally(() => setRosterLoading(false));
  }, [open, isEdit]);

  const selectedIds = watch("employee_ids") ?? [];

  const term = search.trim().toLowerCase();
  const filtered = term
    ? roster.filter((r) =>
        `${r.full_name} ${r.area_name ?? ""}`.toLowerCase().includes(term),
      )
    : roster;

  const toggle = (id: string, checked: boolean) => {
    const current = getValues("employee_ids") ?? [];
    setValue(
      "employee_ids",
      checked ? [...current, id] : current.filter((v) => v !== id),
      { shouldValidate: true },
    );
  };

  // Adds/removes only the rows currently matching the search, so a filtered
  // "select all" cannot silently drop selections made under another filter.
  const toggleAllFiltered = (checked: boolean) => {
    const current = new Set(getValues("employee_ids") ?? []);
    for (const r of filtered) {
      if (checked) current.add(r.id);
      else current.delete(r.id);
    }
    setValue("employee_ids", [...current], { shouldValidate: true });
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));

  const onSubmit = async (data: JobOrderSpecialOrderCreateValues) => {
    setLoading(true);
    try {
      if (isEdit) {
        const result = await updateJobOrderSpecialOrder(specialOrder.id, data);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Special order updated.");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await createJobOrderSpecialOrder(data);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Special order created.");
      onOpenChange(false);
      router.push(`/job-orders/special-orders/${result.data!.id}`);
    } catch {
      // The actions can throw rather than return { error } (a Supabase read
      // failure rethrows). Without this the dialog stays gated shut on
      // `loading` with no explanation.
      toast.error(
        "Something went wrong saving this special order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="!max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Special Order" : "New Special Order"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "These fields print on the special order. Personnel are managed on the special order page."
              : "Fill in the heading and choose the Job Order personnel this order directs."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="so_no">SO No.</Label>
              <Input
                id="so_no"
                placeholder="2025-AHFO-SO-052"
                {...register("so_no")}
              />
              <p className="text-xs text-muted-foreground">
                Prints as “SPECIAL ORDER NO. …”.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="so_date">Date *</Label>
              <Input
                id="so_date"
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
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              {...register("subject")}
              aria-invalid={!!errors.subject}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="period_covered">Effective</Label>
            <Input
              id="period_covered"
              placeholder="JUNE 2025"
              {...register("period_covered")}
            />
            <p className="text-xs text-muted-foreground">
              Printed word-for-word in “…during Saturdays and Holidays only
              effective <strong>…</strong>; thus:”.
            </p>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Job Order personnel *</Label>
                <span className="text-sm font-medium">
                  {selectedIds.length} selected
                </span>
              </div>
              <Input
                placeholder="Search name or area…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="rounded-md border">
                <label className="flex items-center gap-2 border-b p-2 text-sm">
                  <Checkbox
                    checked={allFilteredSelected}
                    disabled={filtered.length === 0}
                    onCheckedChange={(c) => toggleAllFiltered(!!c)}
                  />
                  <span>
                    Select all{term ? " matching" : ""} ({filtered.length})
                  </span>
                </label>
                <ScrollArea className="h-56">
                  <div className="space-y-1 p-2">
                    {rosterLoading && (
                      <p className="p-2 text-sm text-muted-foreground">Loading…</p>
                    )}
                    {!rosterLoading && filtered.length === 0 && (
                      <p className="p-2 text-sm text-muted-foreground">
                        No matching active Job Order employees.
                      </p>
                    )}
                    {filtered.map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(c) => toggle(r.id, !!c)}
                        />
                        <span className="flex-1">{r.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.area_name ?? "—"}
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {errors.employee_ids && (
                <p className="text-sm text-destructive">
                  {errors.employee_ids.message}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (!isEdit && selectedIds.length === 0)}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create Special Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
