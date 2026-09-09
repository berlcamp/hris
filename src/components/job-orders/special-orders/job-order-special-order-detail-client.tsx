"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Copy, Loader2, Pencil, Printer, Trash2 } from "lucide-react";

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
import { JobOrderSpecialOrderMembersTable } from "./job-order-special-order-members-table";
import { JobOrderSpecialOrderFormDialog } from "./job-order-special-order-form-dialog";
import { JobOrderSpecialOrderDuplicateDialog } from "./job-order-special-order-duplicate-dialog";
import { deleteJobOrderSpecialOrder } from "@/lib/actions/job-order-special-order-actions";
import { generateJobOrderSpecialOrderPrint } from "@/lib/pdf/generateJobOrderSpecialOrder";
import type {
  JobOrderSpecialOrder,
  JobOrderSpecialOrderMember,
} from "@/lib/types";

/** Typed verbatim (case-sensitive) before Delete unlocks. */
const DELETE_CONFIRM_PHRASE = "DELETE";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMMM d, yyyy") : "—";
}

interface JobOrderSpecialOrderDetailClientProps {
  specialOrder: JobOrderSpecialOrder;
  members: JobOrderSpecialOrderMember[];
  canEdit: boolean;
}

export function JobOrderSpecialOrderDetailClient({
  specialOrder,
  members,
  canEdit,
}: JobOrderSpecialOrderDetailClientProps) {
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
      const result = await deleteJobOrderSpecialOrder(specialOrder.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Special order deleted.");
      router.push("/job-orders/special-orders");
    } catch {
      toast.error(
        "Something went wrong deleting this special order. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = () => {
    // Printing opens the browser's native print dialog directly (see
    // print-html.ts) — there is no download/blob step, hence no pending state.
    generateJobOrderSpecialOrderPrint({
      soNo: specialOrder.so_no,
      subject: specialOrder.subject,
      soDate: specialOrder.so_date,
      periodCovered: specialOrder.period_covered,
      rows: members.map((m) => ({
        full_name: m.full_name,
        area_assigned: m.area_assigned,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Special Order No. {specialOrder.so_no ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {specialOrder.subject}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Date</span>{" "}
              <strong>{fmtDate(specialOrder.so_date)}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Effective</span>{" "}
              <strong>{specialOrder.period_covered ?? "—"}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Personnel</span>{" "}
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
            Print Special Order
          </Button>
        </div>
      </div>

      <JobOrderSpecialOrderMembersTable
        specialOrderId={specialOrder.id}
        members={members}
        editable={canEdit}
      />

      <JobOrderSpecialOrderFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        specialOrder={specialOrder}
      />

      <JobOrderSpecialOrderDuplicateDialog
        source={duplicateOpen ? specialOrder : null}
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
            <AlertDialogTitle>Delete this special order?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the special order and all {members.length} of its
              listed personnel. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-so">
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm-so"
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
