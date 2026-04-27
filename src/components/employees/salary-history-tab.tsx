"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalaryHistory } from "@/lib/types";
import { SalaryHistoryFormDialog } from "@/components/employees/salary-history-form-dialog";
import { syncEmployeeFromLatestSalaryHistory } from "@/lib/actions/employee-actions";

const reasonLabels: Record<string, string> = {
  initial: "Initial",
  step_increment: "Step Increment",
  promotion: "Promotion",
  reclassification: "Reclassification",
  salary_standardization: "Salary Standardization",
  adjustment: "Adjustment",
  demotion: "Demotion",
};

const reasonBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  initial: "outline",
  step_increment: "secondary",
  promotion: "default",
  reclassification: "secondary",
  salary_standardization: "secondary",
  adjustment: "outline",
  demotion: "destructive",
};

export function SalaryHistoryTab({
  salaryHistory,
  employeeId,
  canManage = false,
  defaultSalaryGrade = 1,
  defaultStep = 1,
}: {
  salaryHistory: SalaryHistory[];
  employeeId: string;
  canManage?: boolean;
  /** Employee row's cached salary_grade — used to detect drift from latest history. */
  defaultSalaryGrade?: number;
  /** Employee row's cached step_increment — used to detect drift from latest history. */
  defaultStep?: number;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalaryHistory | null>(null);
  const [syncing, startSyncTransition] = useTransition();

  // The list comes ordered by effective_date desc, with newest created_at first
  // for rows on the same date — the same priority used by the server sync.
  const latestRow = salaryHistory[0] ?? null;
  const drift =
    latestRow != null &&
    (latestRow.salary_grade !== defaultSalaryGrade ||
      latestRow.step !== defaultStep);

  function handleSync() {
    startSyncTransition(async () => {
      const res = await syncEmployeeFromLatestSalaryHistory(employeeId);
      if ("updated" in res && res.updated) {
        toast.success(
          `Employee record updated to SG ${res.salary_grade} — Step ${res.step}.`
        );
        router.refresh();
      } else {
        toast.message("Employee record already matches the latest history.");
        router.refresh();
      }
    });
  }

  return (
    <>
      {drift && canManage && latestRow && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Employee record is out of sync with salary history.</p>
            <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
              Profile shows{" "}
              <span className="font-semibold">SG {defaultSalaryGrade} — Step {defaultStep}</span>
              , but the latest salary history row (
              {format(new Date(latestRow.effective_date), "MMM d, yyyy")}) is{" "}
              <span className="font-semibold">
                SG {latestRow.salary_grade} — Step {latestRow.step}
              </span>
              .
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Sync now
          </Button>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Salary History</CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl">
              NOSI eligibility uses the latest effective date among the reasons you can add here
              (step increment, promotion, reclassification, initial, demotion).
            </CardDescription>
          </div>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingRecord(null);
                setFormOpen(true);
              }}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add record
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {salaryHistory.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              No salary history records found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Salary Grade</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Remarks</TableHead>
                  {canManage && <TableHead className="w-12 text-right">Edit</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryHistory.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {format(new Date(record.effective_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{record.salary_grade}</TableCell>
                    <TableCell>{record.step}</TableCell>
                    <TableCell>
                      {record.salary_amount > 0
                        ? `₱${record.salary_amount.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reasonBadgeVariant[record.reason] ?? "outline"
                        }
                      >
                        {reasonLabels[record.reason] ?? record.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.remarks ?? "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingRecord(record);
                            setFormOpen(true);
                          }}
                          aria-label="Edit salary history"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <SalaryHistoryFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingRecord(null);
          }}
          employeeId={employeeId}
          defaultSalaryGrade={defaultSalaryGrade}
          defaultStep={defaultStep}
          record={editingRecord}
        />
      )}
    </>
  );
}
