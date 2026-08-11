"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Copy, Loader2, Pencil, Printer, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { JobOrderMemoMembersTable } from "./job-order-memo-members-table";
import { JobOrderMemoFormDialog } from "./job-order-memo-form-dialog";
import { JobOrderMemoDuplicateDialog } from "./job-order-memo-duplicate-dialog";
import { deleteJobOrderMemo } from "@/lib/actions/job-order-memo-actions";
import { generateJobOrderMemoPrint } from "@/lib/pdf/generateJobOrderMemo";
import type { JobOrderMemo, JobOrderMemoMember } from "@/lib/types";

/** Typed verbatim (case-sensitive) before Delete unlocks. */
const DELETE_CONFIRM_PHRASE = "DELETE";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMMM d, yyyy") : "—";
}

interface JobOrderMemoDetailClientProps {
  memo: JobOrderMemo;
  members: JobOrderMemoMember[];
  canEdit: boolean;
}

export function JobOrderMemoDetailClient({
  memo,
  members,
  canEdit,
}: JobOrderMemoDetailClientProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteUnlocked = deleteConfirmText === DELETE_CONFIRM_PHRASE;

  const handleDelete = async () => {
    if (!deleteUnlocked) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderMemo(memo.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Memo deleted.");
      router.push("/job-orders/memos");
    } catch {
      toast.error("Something went wrong deleting this memo. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = () => {
    // Printing opens the browser's native print dialog directly (see
    // print-html.ts) — there is no download/blob step, hence no pending state.
    generateJobOrderMemoPrint({
      memoType: memo.memo_type,
      memoNo: memo.memo_no,
      subject: memo.subject,
      memoDate: memo.memo_date,
      periodCovered: memo.period_covered,
      rows: members.map((m) => ({
        full_name: m.full_name,
        office_assignment: m.office_assignment,
        daily_rate: m.daily_rate,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Memorandum No. {memo.memo_no ?? "—"}
            </h1>
            <Badge variant={memo.memo_type === "retain" ? "secondary" : "default"}>
              {memo.memo_type === "retain" ? "Retain" : "New"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{memo.subject}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Date</span>{" "}
              <strong>{fmtDate(memo.memo_date)}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Period covered</span>{" "}
              <strong>{memo.period_covered ?? "—"}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Employees</span>{" "}
              <strong>{members.length}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit details
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDuplicateOpen(true)}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button size="sm" onClick={handlePrint} disabled={members.length === 0}>
            <Printer className="h-4 w-4" />
            Print Memo
          </Button>
        </div>
      </div>

      <JobOrderMemoMembersTable
        memoId={memo.id}
        members={members}
        editable={canEdit}
      />

      <JobOrderMemoFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        memo={memo}
      />

      <JobOrderMemoDuplicateDialog
        source={duplicateOpen ? memo : null}
        onOpenChange={setDuplicateOpen}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          // Clear on every open/close so a previously-typed confirmation can
          // never carry over and pre-unlock the next delete.
          setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this memo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the memorandum and all {members.length} of its listed
              employees. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-memo">
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm-memo"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              autoComplete="off"
              disabled={deleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !deleteUnlocked}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
