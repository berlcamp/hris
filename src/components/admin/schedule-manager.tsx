"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Moon,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  createSchedule,
  updateSchedule,
  deleteSchedule,
  type ScheduleWithAssignedCount,
} from "@/lib/actions/schedule-actions";
import {
  scheduleFormSchema,
  type ScheduleFormValues,
} from "@/lib/validations/schedule-schema";
import { ScheduleAssignmentDialog } from "./schedule-assignment-dialog";

interface ScheduleManagerProps {
  initialSchedules: ScheduleWithAssignedCount[];
}

function crossesMidnight(timeIn: string, timeOut: string): boolean {
  return timeOut <= timeIn;
}

function formatHHMM(t: string): string {
  return t.slice(0, 5);
}

export function ScheduleManager({ initialSchedules }: ScheduleManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<ScheduleWithAssignedCount | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleWithAssignedCount | null>(null);
  const [assignTarget, setAssignTarget] = useState<ScheduleWithAssignedCount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogOpen = creating || editing !== null;

  const handleClose = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSubmit = async (values: ScheduleFormValues) => {
    setSubmitting(true);
    try {
      const result = editing
        ? await updateSchedule(editing.id, values)
        : await createSchedule(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Schedule updated." : "Schedule created.");
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
      const result = await deleteSchedule(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Schedule deleted.");
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
              {initialSchedules.length} schedule
              {initialSchedules.length === 1 ? "" : "s"} defined.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New Schedule
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialSchedules.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8 text-sm"
                    >
                      No schedules yet. Click &ldquo;New Schedule&rdquo; to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  initialSchedules.map((s) => {
                    const night = crossesMidnight(s.time_in, s.time_out);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {night ? (
                              <Moon className="h-4 w-4 text-indigo-500" />
                            ) : (
                              <Sun className="h-4 w-4 text-amber-500" />
                            )}
                            <span>{s.name}</span>
                          </div>
                          {s.notes && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {s.notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatHHMM(s.time_in)} – {formatHHMM(s.time_out)}
                          {night && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              crosses midnight
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.break_start && s.break_end ? (
                            `${formatHHMM(s.break_start)} – ${formatHHMM(s.break_end)}`
                          ) : (
                            <span className="text-muted-foreground italic font-sans">
                              no break
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAssignTarget(s)}
                          >
                            <Users className="h-4 w-4" />
                            {s.assigned_count}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditing(s)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(s)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
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
            <DialogTitle>
              {editing ? "Edit Schedule" : "New Schedule"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the shift template. Existing attendance records are not recomputed."
                : "Define a shift template you can later assign to employees."}
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm
            initial={
              editing
                ? {
                    name: editing.name,
                    time_in: formatHHMM(editing.time_in),
                    time_out: formatHHMM(editing.time_out),
                    has_break: !!(editing.break_start && editing.break_end),
                    break_start: editing.break_start
                      ? formatHHMM(editing.break_start)
                      : null,
                    break_end: editing.break_end
                      ? formatHHMM(editing.break_end)
                      : null,
                    notes: editing.notes,
                  }
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
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.assigned_count > 0 ? (
                <>
                  <span className="font-medium">{deleteTarget.assigned_count}</span>{" "}
                  employee{deleteTarget.assigned_count === 1 ? "" : "s"} currently
                  assigned to this schedule will be unassigned. Past attendance
                  records are preserved.
                </>
              ) : (
                "This schedule is not assigned to any employees."
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

      {assignTarget && (
        <ScheduleAssignmentDialog
          schedule={assignTarget}
          open={true}
          onOpenChange={(o) => {
            if (!o) setAssignTarget(null);
          }}
        />
      )}
    </>
  );
}

interface ScheduleFormProps {
  initial?: ScheduleFormValues;
  submitting: boolean;
  onSubmit: (values: ScheduleFormValues) => void;
  onCancel: () => void;
}

function ScheduleForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(scheduleFormSchema) as any,
    defaultValues:
      initial ?? {
        name: "",
        time_in: "08:00",
        time_out: "17:00",
        has_break: true,
        break_start: "12:00",
        break_end: "13:00",
        notes: null,
      },
  });

  const hasBreak = watch("has_break");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          placeholder="e.g. Regular 8AM-5PM"
          {...register("name")}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="time_in">Time In *</Label>
          <Input
            id="time_in"
            type="time"
            {...register("time_in")}
            aria-invalid={!!errors.time_in}
          />
          {errors.time_in && (
            <p className="text-sm text-destructive">{errors.time_in.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="time_out">Time Out *</Label>
          <Input
            id="time_out"
            type="time"
            {...register("time_out")}
            aria-invalid={!!errors.time_out}
          />
          {errors.time_out && (
            <p className="text-sm text-destructive">{errors.time_out.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Has a break</p>
          <p className="text-xs text-muted-foreground">
            Employees must punch out/in for lunch.
          </p>
        </div>
        <Switch
          checked={hasBreak}
          onCheckedChange={(c) => setValue("has_break", !!c, { shouldValidate: true })}
        />
      </div>

      {hasBreak && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="break_start">Break Start *</Label>
            <Input
              id="break_start"
              type="time"
              {...register("break_start")}
              aria-invalid={!!errors.break_start}
            />
            {errors.break_start && (
              <p className="text-sm text-destructive">
                {errors.break_start.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="break_end">Break End *</Label>
            <Input
              id="break_end"
              type="time"
              {...register("break_end")}
              aria-invalid={!!errors.break_end}
            />
            {errors.break_end && (
              <p className="text-sm text-destructive">
                {errors.break_end.message}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Optional description"
          rows={2}
          {...register("notes")}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial ? "Save Changes" : "Create Schedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
