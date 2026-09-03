"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";

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
import { JobOrderPayrollMembersTable } from "./job-order-payroll-members-table";
import { JobOrderPayrollEditDialog } from "./job-order-payroll-edit-dialog";
import { JobOrderPayrollPrintMenu } from "./job-order-payroll-print-menu";
import { deleteJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import { refreshJobOrderPayrollMembers } from "@/lib/actions/job-order-payroll-member-actions";
import type { JobOrderPayroll, JobOrderPayrollMember } from "@/lib/types";

/** Typed verbatim (case-sensitive) before Delete unlocks. */
const DELETE_CONFIRM_PHRASE = "DELETE";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

interface JobOrderPayrollDetailClientProps {
  payroll: JobOrderPayroll;
  members: JobOrderPayrollMember[];
  isSuperAdmin: boolean;
  /**
   * Payroll write access. False for a JO Manager whose "Can create/edit
   * Payroll" switch is off — the page still opens and still prints, but every
   * control that mutates the payroll is withheld. The server actions gate on
   * the same flag; this only keeps dead buttons off the screen.
   */
  canEdit: boolean;
}

export function JobOrderPayrollDetailClient({
  payroll,
  members,
  isSuperAdmin,
  canEdit,
}: JobOrderPayrollDetailClientProps) {
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteUnlocked = deleteConfirmText === DELETE_CONFIRM_PHRASE;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshJobOrderPayrollMembers(payroll.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const { updated, skipped } = result.data!;
      toast.success(
        updated === 0
          ? "Every member already matches the roster."
          : `${updated} member${updated === 1 ? "" : "s"} updated from the roster.`,
        skipped > 0
          ? {
              description: `${skipped} member${skipped === 1 ? " is" : "s are"} no longer linked to an active roster record and kept its snapshot.`,
            }
          : undefined,
      );
      setRefreshConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong refreshing these members. Please try again.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUnlocked) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderPayroll(payroll.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll deleted.");
      router.push("/job-orders/payroll");
    } catch {
      toast.error(
        "Something went wrong deleting this payroll. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {fmtDate(payroll.period_start)} – {fmtDate(payroll.period_end)}
            </h1>
            {payroll.is_reconstructed && (
              <Badge
                variant="outline"
                title="Imported from the legacy system and priced at the employee's rate at import time — a reconstruction, not the original record."
              >
                Reconstructed
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {payroll.description ?? "No description"}
            {payroll.areas ? ` · ${payroll.areas}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Members</span>{" "}
              <strong>{payroll.member_count}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Gross</span>{" "}
              <strong>{fmtMoney(payroll.total_gross)}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">SSS</span>{" "}
              <strong>{fmtMoney(payroll.total_sss)}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Net</span>{" "}
              <strong>{fmtMoney(payroll.total_net)}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit details
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshConfirmOpen(true)}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh from roster
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}

          <JobOrderPayrollPrintMenu payroll={payroll} members={members} />
        </div>
      </div>

      <JobOrderPayrollMembersTable
        payrollId={payroll.id}
        members={members}
        editable={canEdit}
      />

      <JobOrderPayrollEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        payroll={payroll}
      />

      <AlertDialog
        open={refreshConfirmOpen}
        onOpenChange={setRefreshConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh members from the roster?</AlertDialogTitle>
            <AlertDialogDescription>
              Members were snapshotted when they were added, so later edits to
              a Job Order employee — a corrected LandBank account number, for
              instance — do not reach this payroll on their own. This re-copies
              each member&apos;s name, area, daily rate, SSS, LandBank account
              and community tax details from the roster.
              <br />
              <br />
              Days and overtime hours are untouched, but any daily rate typed
              into the members table is replaced by the roster&apos;s current
              rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refreshing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefresh} disabled={refreshing}>
              {refreshing && <Loader2 className="h-4 w-4 animate-spin" />}
              Refresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => {
          setDeleteConfirmOpen(o);
          // Clear on every open/close so a previously-typed confirmation can
          // never carry over and pre-unlock the next delete.
          setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payroll and all {payroll.member_count} of its
              member rows. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
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
