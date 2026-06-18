"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Loader2, CalendarOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  createHoliday,
  updateHoliday,
  deleteHoliday,
  type HolidayRow,
} from "@/lib/actions/holiday-actions";
import {
  holidayFormSchema,
  type HolidayFormValues,
  HOLIDAY_TYPE_LABELS,
  HOLIDAY_TYPES,
} from "@/lib/validations/holiday-schema";

interface HolidayManagerProps {
  initialHolidays: HolidayRow[];
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HolidayManager({ initialHolidays }: HolidayManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogOpen = creating || editing !== null;

  const handleClose = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSubmit = async (values: HolidayFormValues) => {
    setSubmitting(true);
    try {
      const result = editing
        ? await updateHoliday(editing.id, values)
        : await createHoliday(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Holiday updated." : "Holiday added.");
      handleClose();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const result = await deleteHoliday(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Holiday deleted.");
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {initialHolidays.length} holiday
              {initialHolidays.length === 1 ? "" : "s"} defined.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New Holiday
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialHolidays.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8 text-sm"
                    >
                      No holidays yet. Click &ldquo;New Holiday&rdquo; to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  initialHolidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <CalendarOff className="h-4 w-4 text-rose-500" />
                          <span>{formatDate(h.date)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={h.type === "full" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {HOLIDAY_TYPE_LABELS[h.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditing(h)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(h)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Holiday" : "New Holiday"}</DialogTitle>
            <DialogDescription>
              Days marked here print as &ldquo;HOLIDAY&rdquo; on the DTR. Use a
              half day to keep the working half of the day on the record.
            </DialogDescription>
          </DialogHeader>
          <HolidayForm
            initial={
              editing
                ? { date: editing.date, name: editing.name, type: editing.type }
                : undefined
            }
            submitting={submitting}
            onSubmit={handleSubmit}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium">{deleteTarget.name}</span> on{" "}
                  {formatDate(deleteTarget.date)} will no longer appear on DTRs.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface HolidayFormProps {
  initial?: HolidayFormValues;
  submitting: boolean;
  onSubmit: (values: HolidayFormValues) => void;
  onCancel: () => void;
}

function HolidayForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: HolidayFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HolidayFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(holidayFormSchema) as any,
    defaultValues: initial ?? { date: "", name: "", type: "full" },
  });

  const type = watch("type");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="date">Date *</Label>
        <Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />
        {errors.date && (
          <p className="text-sm text-destructive">{errors.date.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          placeholder="e.g. Independence Day"
          {...register("name")}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Type *</Label>
        <Select
          items={HOLIDAY_TYPE_LABELS}
          value={type}
          onValueChange={(v) =>
            v && setValue("type", v as HolidayFormValues["type"], { shouldValidate: true })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {HOLIDAY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {HOLIDAY_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.type && (
          <p className="text-sm text-destructive">{errors.type.message}</p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial ? "Save Changes" : "Add Holiday"}
        </Button>
      </DialogFooter>
    </form>
  );
}
