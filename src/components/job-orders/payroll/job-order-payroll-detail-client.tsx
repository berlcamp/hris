"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ChevronDown,
  Copy,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  JobOrderPayrollDuplicateDialog,
  type JobOrderPayrollDuplicateSource,
} from "./job-order-payroll-duplicate-dialog";
import {
  deleteJobOrderPayroll,
  finalizeJobOrderPayroll,
  reopenJobOrderPayroll,
} from "@/lib/actions/job-order-payroll-actions";
import { refreshMembersFromRoster } from "@/lib/actions/job-order-payroll-member-actions";
import { toPrintRow } from "@/lib/job-order-payroll-helpers";
import {
  generateJoPayrollByDeptPrint,
  generateJoPayrollNoAtmPrint,
  generateJoPayrollNoSssPrint,
  generateJoPayrollObrOvertimePrint,
  generateJoPayrollObrPrint,
  generateJoPayrollOvertimeNoAtmPrint,
  generateJoPayrollOvertimePrint,
  generateJoPayrollPrint,
  generateJoPayrollSummaryOvertimePrint,
  generateJoPayrollSummaryPrint,
  type GenerateJoPayrollPrintParams,
} from "@/lib/pdf/generateJobOrderPayroll";
import type { JobOrderPayroll, JobOrderPayrollMember } from "@/lib/types";

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
}

export function JobOrderPayrollDetailClient({
  payroll,
  members,
  isSuperAdmin,
}: JobOrderPayrollDetailClientProps) {
  const router = useRouter();
  const isDraft = payroll.status === "draft";

  const [editOpen, setEditOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] =
    useState<JobOrderPayrollDuplicateSource | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshMembersFromRoster(payroll.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Refreshed ${result.updated ?? 0} member(s), skipped ${result.skipped ?? 0}`,
      );
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong refreshing from the roster. Please try again.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const result = await finalizeJobOrderPayroll(payroll.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll finalized.");
      setFinalizeConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong finalizing this payroll. Please try again.",
      );
    } finally {
      setFinalizing(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const result = await reopenJobOrderPayroll(payroll.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll reopened.");
      setReopenConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong reopening this payroll. Please try again.",
      );
    } finally {
      setReopening(false);
    }
  };

  const handleDelete = async () => {
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

  const printParams: GenerateJoPayrollPrintParams = {
    rows: members.map(toPrintRow),
    periodStart: payroll.period_start,
    periodEnd: payroll.period_end,
    particulars: payroll.particulars,
    description: payroll.description,
    areas: payroll.areas,
    draft: isDraft,
  };

  const printVariants: { label: string; run: () => void }[] = [
    {
      label: "Daily Wages Payroll (with SSS)",
      run: () => generateJoPayrollPrint(printParams),
    },
    {
      label: "Daily Wages Payroll (No SSS)",
      run: () => generateJoPayrollNoSssPrint(printParams),
    },
    {
      label: "By Department",
      run: () => generateJoPayrollByDeptPrint(printParams),
    },
    { label: "Summary", run: () => generateJoPayrollSummaryPrint(printParams) },
    {
      label: "Cash Payable (No ATM)",
      run: () => generateJoPayrollNoAtmPrint(printParams),
    },
    {
      label: "Overtime (with ATM)",
      run: () => generateJoPayrollOvertimePrint(printParams),
    },
    {
      label: "Overtime (No ATM)",
      run: () => generateJoPayrollOvertimeNoAtmPrint(printParams),
    },
    {
      label: "Summary + Overtime",
      run: () => generateJoPayrollSummaryOvertimePrint(printParams),
    },
    { label: "OBR", run: () => generateJoPayrollObrPrint(printParams) },
    {
      label: "OBR (Overtime)",
      run: () => generateJoPayrollObrOvertimePrint(printParams),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {fmtDate(payroll.period_start)} – {fmtDate(payroll.period_end)}
            </h1>
            <Badge variant={isDraft ? "secondary" : "default"}>
              {isDraft ? "Draft" : "Finalized"}
            </Badge>
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
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit details
            </Button>
          )}
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh from roster
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDuplicateSource(payroll)}
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </Button>
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFinalizeConfirmOpen(true)}
            >
              <Lock className="h-4 w-4" />
              Finalize
            </Button>
          )}
          {!isDraft && isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReopenConfirmOpen(true)}
            >
              <LockOpen className="h-4 w-4" />
              Reopen
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

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <Printer className="h-4 w-4" />
              Print
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Print variant</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {printVariants.map((v) => (
                <DropdownMenuItem key={v.label} onClick={v.run}>
                  {v.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <JobOrderPayrollMembersTable
        payrollId={payroll.id}
        members={members}
        isDraft={isDraft}
      />

      <JobOrderPayrollEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        payroll={payroll}
      />

      <JobOrderPayrollDuplicateDialog
        source={duplicateSource}
        onOpenChange={(o) => {
          if (!o) setDuplicateSource(null);
        }}
      />

      <AlertDialog
        open={finalizeConfirmOpen}
        onOpenChange={setFinalizeConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              Finalizing makes this payroll read-only — members, rates, and
              metadata can no longer be edited. Only a super admin can reopen
              it afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalize} disabled={finalizing}>
              {finalizing && <Loader2 className="h-4 w-4 animate-spin" />}
              Finalize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenConfirmOpen} onOpenChange={setReopenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              This returns the payroll to draft so members and metadata can be
              edited again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopening}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopen} disabled={reopening}>
              {reopening && <Loader2 className="h-4 w-4 animate-spin" />}
              Reopen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
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
