"use client";

import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { cn } from "@/lib/utils";
import { LeaveCreditAdjustmentDialog } from "@/components/leaves/leave-credit-adjustment-dialog";
import type {
  LeaveCreditAdjustmentEntry,
  LeaveLedgerEntry,
  LeaveTypeRow,
} from "@/lib/actions/leave-actions";

interface LeaveCreditWithType {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credits: number;
  used_credits: number;
  balance: number;
  leave_types: { code: string; name: string } | null;
}

interface LeaveCreditsTabProps {
  leaveCredits: LeaveCreditWithType[];
  ledger: LeaveLedgerEntry[];
  adjustments: LeaveCreditAdjustmentEntry[];
  ledgerYear: number;
  employeeId: string;
  employeeName: string;
  leaveTypes: LeaveTypeRow[];
  isAdmin: boolean;
  needsManualEntry: boolean;
}

const statusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

const fmt3 = (n: number) => parseFloat(Number(n).toFixed(3)).toString();

export function LeaveCreditsTab({
  leaveCredits,
  ledger,
  adjustments,
  ledgerYear,
  employeeId,
  employeeName,
  leaveTypes,
  isAdmin,
  needsManualEntry,
}: LeaveCreditsTabProps) {
  const year = new Date().getFullYear();

  // Build cards from all leave types so admins can adjust types the employee
  // doesn't yet have a balance for. Existing rows take precedence.
  const cards = leaveTypes.map((lt) => {
    const existing = leaveCredits.find((c) => c.leave_type_id === lt.id);
    return {
      leaveType: lt,
      credit: existing,
    };
  });

  if (!isAdmin && leaveCredits.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No leave credits allocated for this year.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {needsManualEntry && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              VL/SL needs reconciliation
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              This employee was not in the legacy CSV import, so their VL and SL
              balances were reset to zero. Please input the correct VL/SL
              balance as of May 8, 2026.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ leaveType, credit }) => {
        // Hide empty cards from non-admins; admins see every type so they can
        // seed a balance via adjustment.
        if (!credit && !isAdmin) return null;

        return (
          <Card key={leaveType.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">
                  {leaveType.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{leaveType.code}</p>
              </div>
              {isAdmin && (
                <LeaveCreditAdjustmentDialog
                  employeeId={employeeId}
                  employeeName={employeeName}
                  leaveTypes={leaveTypes}
                  year={year}
                  fixedLeaveType={{
                    id: leaveType.id,
                    code: leaveType.code,
                    name: leaveType.name,
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Adjust ${leaveType.code}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <CardContent>
              {credit ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{credit.balance}</span>
                    {leaveType.code !== "VL" && leaveType.code !== "SL" && (
                      <span className="text-sm text-muted-foreground">
                        / {credit.total_credits}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {credit.used_credits} used
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No balance — click pencil to add.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>

      {adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Manual Adjustments ({ledgerYear})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead className="text-center">Adjustment</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Adjusted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj) => {
                  const isCredit = adj.amount >= 0;
                  return (
                    <TableRow key={adj.id}>
                      <TableCell>
                        {format(new Date(adj.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {adj.leave_types?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {adj.leave_types?.code ?? ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "font-medium",
                            isCredit
                              ? "text-emerald-600 dark:text-emerald-500"
                              : "text-red-600 dark:text-red-500",
                          )}
                        >
                          {isCredit ? "+" : ""}
                          {fmt3(adj.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {adj.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {adj.created_by_name ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Leave Ledger ({ledgerYear})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No leave transactions for {ledgerYear}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead className="text-center">w/ Pay</TableHead>
                  <TableHead className="text-center">w/o Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filed On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => {
                  const daysWithPay = Number(
                    entry.days_with_pay ?? entry.days_applied
                  );
                  const daysWithoutPay = Math.max(
                    0,
                    Number(entry.days_applied) - daysWithPay
                  );
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Link
                          href={`/leaves/${entry.id}`}
                          className="block hover:underline"
                        >
                          <p className="font-medium">
                            {entry.leave_types?.name ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.leave_types?.code ?? ""}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {format(new Date(entry.start_date), "MMM d")} –{" "}
                        {format(new Date(entry.end_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {fmt3(entry.days_applied)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {fmt3(daysWithPay)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {daysWithoutPay > 0 ? (
                          <span className="font-medium text-amber-600 dark:text-amber-500">
                            {fmt3(daysWithoutPay)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant[entry.status] ?? "outline"}
                        >
                          {entry.status.charAt(0).toUpperCase() +
                            entry.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(entry.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
