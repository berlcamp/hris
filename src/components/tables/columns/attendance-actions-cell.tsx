"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  MessageSquare,
  History,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
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
import { deleteAttendanceEntry } from "@/lib/actions/attendance-actions";
import type { AttendanceLogRow } from "@/lib/actions/attendance-actions";

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return format(new Date(value), "MMM d, yyyy h:mm a");
}

export function AttendanceActionsCell({
  row,
  canDelete = false,
}: {
  row: AttendanceLogRow;
  /** Deleting an entry is narrower than correcting one — see isAttendanceManager. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteAttendanceEntry(row.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Attendance entry deleted");
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const employeeName = row.employees
    ? `${row.employees.last_name}, ${row.employees.first_name}`
    : "this employee";

  const dateLabel = format(new Date(row.date + "T00:00:00"), "MMM d, yyyy");
  const createdAt = formatTimestamp(row.created_at);
  const updatedAt = formatTimestamp(row.updated_at);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/attendance/entry?id=${row.id}`)}
          >
            <Pencil className="h-4 w-4" />
            Correct entry
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRemarksOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            Remarks
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogsOpen(true)}>
            <History className="h-4 w-4" />
            Logs
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={remarksOpen} onOpenChange={setRemarksOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remarks</DialogTitle>
            <DialogDescription>
              {employeeName} — {dateLabel}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">
            {row.remarks ?? (
              <span className="text-muted-foreground">No remarks recorded.</span>
            )}
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entry Logs</DialogTitle>
            <DialogDescription>
              {employeeName} — {dateLabel}
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="capitalize">{row.source}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Recorded by</dt>
              <dd className="text-right">{row.created_by_email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Recorded at</dt>
              <dd className="text-right">{createdAt ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last edited by</dt>
              <dd className="text-right">{row.updated_by_email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last edited at</dt>
              <dd className="text-right">{updatedAt ?? "—"}</dd>
            </div>
          </dl>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!deleting) setConfirmOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this attendance entry?</AlertDialogTitle>
            <AlertDialogDescription>
              The record for {employeeName} on {row.date} will be permanently
              removed and leave-credit deductions for that month recomputed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
