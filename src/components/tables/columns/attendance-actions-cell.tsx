"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

export function AttendanceActionsCell({ row }: { row: AttendanceLogRow }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Correct entry"
          render={<Link href={`/attendance/entry?id=${row.id}`} />}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Delete entry"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

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
