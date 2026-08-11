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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "@/components/ui/dialog";
import {
  jobOrderMemoCreateSchema,
  jobOrderMemoMetadataSchema,
  type JobOrderMemoCreateValues,
} from "@/lib/validations/job-order-memo-schema";
import {
  createJobOrderMemo,
  getJobOrdersForMemoPicker,
  updateJobOrderMemo,
} from "@/lib/actions/job-order-memo-actions";
import type {
  JobOrderMemo,
  JobOrderMemoPickerOption,
  JobOrderMemoType,
} from "@/lib/types";

/**
 * The subject each template is normally issued under. Prefilled when the type
 * is chosen, and only while the user has not typed a subject of their own —
 * same guard as the payroll create dialog's auto-filled `days`.
 */
const DEFAULT_SUBJECT: Record<JobOrderMemoType, string> = {
  new: "JOB ORDER CONTRACTS",
  retain: "INDIVIDUALS ENGAGED THROUGH JOB ORDERS FOR THE PERIOD OF ",
};

const blankDefaults: JobOrderMemoCreateValues = {
  subject: "",
  memo_date: "",
  memo_type: "new",
  memo_no: null,
  period_covered: null,
  employee_ids: [],
};

interface JobOrderMemoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Null creates a new memo (with the employee picker); a memo edits its
   * header fields only — membership is managed on the detail page.
   */
  memo: JobOrderMemo | null;
}

export function JobOrderMemoFormDialog({
  open,
  onOpenChange,
  memo,
}: JobOrderMemoFormDialogProps) {
  const router = useRouter();
  const isEdit = memo !== null;

  const [loading, setLoading] = useState(false);
  const [roster, setRoster] = useState<JobOrderMemoPickerOption[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState("");

  const subjectEditedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<JobOrderMemoCreateValues>({
    // The create schema is a superset of the edit one; in edit mode the
    // employee_ids array is not rendered, so it is validated against the
    // metadata schema instead of demanding a selection that has no field.
    resolver: zodResolver(
      isEdit ? jobOrderMemoMetadataSchema : jobOrderMemoCreateSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any,
    defaultValues: blankDefaults,
  });

  // Reset every time the dialog opens so a previous draft — or a previously
  // flipped "subject was typed" guard — never leaks into the next open.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    if (memo) {
      reset({
        subject: memo.subject,
        memo_date: memo.memo_date,
        memo_type: memo.memo_type,
        memo_no: memo.memo_no,
        period_covered: memo.period_covered,
        employee_ids: [],
      });
      subjectEditedRef.current = true;
    } else {
      reset(blankDefaults);
      subjectEditedRef.current = false;
    }
  }, [open, memo, reset]);

  // The roster is only needed by the create form's picker.
  useEffect(() => {
    if (!open || isEdit) return;
    setRosterLoading(true);
    getJobOrdersForMemoPicker()
      .then(setRoster)
      .catch(() => {
        toast.error("Failed to load Job Order employees.");
        setRoster([]);
      })
      .finally(() => setRosterLoading(false));
  }, [open, isEdit]);

  const memoType = watch("memo_type");
  const selectedIds = watch("employee_ids") ?? [];

  const subjectField = register("subject", {
    onChange: () => {
      subjectEditedRef.current = true;
    },
  });

  const onTypeChange = (value: string | null) => {
    if (!value) return;
    const next = value as JobOrderMemoType;
    setValue("memo_type", next, { shouldValidate: true });
    if (!subjectEditedRef.current) {
      setValue("subject", DEFAULT_SUBJECT[next], { shouldValidate: true });
    }
  };

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

  const onSubmit = async (data: JobOrderMemoCreateValues) => {
    setLoading(true);
    try {
      if (isEdit) {
        const result = await updateJobOrderMemo(memo.id, data);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Memo updated.");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await createJobOrderMemo(data);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Memo created.");
      onOpenChange(false);
      router.push(`/job-orders/memos/${result.data!.id}`);
    } catch {
      // The actions can throw rather than return { error } (a Supabase read
      // failure rethrows). Without this the dialog stays gated shut on
      // `loading` with no explanation.
      toast.error("Something went wrong saving this memo. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="!max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Memorandum" : "New Memorandum"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "These fields print on the memo. Employees are managed on the memo page."
              : "Pick the template, fill in the heading, and choose the Job Order employees this memo covers."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memo_type">Type *</Label>
              <Select
                value={memoType}
                items={[
                  { value: "new", label: "New" },
                  { value: "retain", label: "Retain" },
                ]}
                onValueChange={onTypeChange}
              >
                <SelectTrigger id="memo_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="retain">Retain</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {memoType === "retain"
                  ? "Extension notice to all persons concerned."
                  : "Assignment to process the contracts, addressed to the City Administrator."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo_no">SO No.</Label>
              <Input
                id="memo_no"
                placeholder="2026-SNGF-JO-019"
                {...register("memo_no")}
              />
              <p className="text-xs text-muted-foreground">
                Prints as “MEMORANDUM NO. …”.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input id="subject" {...subjectField} aria-invalid={!!errors.subject} />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memo_date">Date *</Label>
              <Input
                id="memo_date"
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

            <div className="space-y-2">
              <Label htmlFor="period_covered">Period covered</Label>
              <Input
                id="period_covered"
                placeholder={
                  memoType === "retain"
                    ? "AUGUST 2026 - SEPTEMBER 2026"
                    : "July 24-31, 2026"
                }
                {...register("period_covered")}
              />
              <p className="text-xs text-muted-foreground">
                Printed word-for-word inside the memo’s opening sentence.
              </p>
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Job Order employees *</Label>
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
                          {r.daily_rate != null ? ` · ${r.daily_rate}` : ""}
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
              {isEdit ? "Save changes" : "Create Memo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
