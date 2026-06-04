import { redirect } from "next/navigation";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { cn } from "@/lib/utils";
import { formatManilaLongDate } from "@/lib/format-date";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { isDeptScoped } from "@/lib/auth-helpers";
import {
  getLeaveLedger,
  getEmployeeLeaveCredits,
  getLeaveCreditAdjustments,
  getLeaveAccrualHistory,
} from "@/lib/actions/leave-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { LeaveLedgerClient } from "@/components/leaves/leave-ledger-client";

export default async function LeaveLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ employee_id?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (
    !["super_admin", "hr_admin"].includes(user.role) &&
    !isDeptScoped(user.role)
  ) {
    redirect("/dashboard");
  }

  const { employee_id, year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  const employees = await getEmployees();

  let ledger: Awaited<ReturnType<typeof getLeaveLedger>> = [];
  let credits: Awaited<ReturnType<typeof getEmployeeLeaveCredits>> = [];
  let adjustments: Awaited<ReturnType<typeof getLeaveCreditAdjustments>> = [];
  let accrualHistory: Awaited<ReturnType<typeof getLeaveAccrualHistory>> = [];

  if (employee_id) {
    [ledger, credits, adjustments, accrualHistory] = await Promise.all([
      getLeaveLedger(employee_id, year),
      getEmployeeLeaveCredits(employee_id, year),
      getLeaveCreditAdjustments(employee_id, year),
      getLeaveAccrualHistory(employee_id, year),
    ]);
  }

  const selectedEmployee = employee_id
    ? employees.find((e) => e.id === employee_id) ?? null
    : null;

  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
    cancelled: "destructive",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Ledger</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-employee leave transaction history.
        </p>
      </div>

      <LeaveLedgerClient
        employees={employees.filter((e) => e.status === "active")}
        selectedEmployeeId={employee_id ?? null}
        year={year}
        ledgerData={ledger.map((entry) => {
          const daysWithPay = Number(entry.days_with_pay ?? entry.days_applied);
          const daysWithoutPay = Math.max(
            0,
            Number(entry.days_applied) - daysWithPay,
          );
          return {
            id: entry.id,
            leave_type: entry.leave_types?.name ?? "Unknown",
            leave_code: entry.leave_types?.code ?? "",
            start_date: entry.start_date,
            end_date: entry.end_date,
            days_applied: entry.days_applied,
            days_with_pay: daysWithPay,
            days_without_pay: daysWithoutPay,
            status: entry.status,
            created_at: entry.created_at,
          };
        })}
      />

      {employee_id && (
        <>
          {/* Credit Summary */}
          {credits.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {credits.map((c) => (
                <Card key={c.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{c.leave_types?.name ?? "Unknown"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{Number(c.balance)}</span>
                      {c.leave_types?.code !== "VL" && c.leave_types?.code !== "SL" && (
                        <span className="text-sm text-muted-foreground">
                          / {Number(c.total_credits)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Number(c.used_credits)} used
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Manual Adjustments */}
          {adjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Manual Adjustments — {selectedEmployee ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}` : ""} ({year})
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
                      const fmt3 = (n: number) =>
                        parseFloat(Number(n).toFixed(3)).toString();
                      const isCredit = adj.amount >= 0;
                      return (
                        <TableRow key={adj.id}>
                          <TableCell>
                            {formatManilaLongDate(adj.created_at)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{adj.leave_types?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{adj.leave_types?.code ?? ""}</p>
                            </div>
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

          {/* Credit Accrual History */}
          {accrualHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Credit History — {selectedEmployee ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}` : ""} ({year})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-center">Credits</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accrualHistory.map((entry) => {
                      const monthLabel = entry.month
                        ? new Date(entry.year, entry.month - 1).toLocaleString("default", { month: "long" })
                        : "—";
                      const sourceLabel: Record<string, string> = {
                        monthly_accrual: "Monthly Accrual",
                        carryover: "Carryover",
                        seed: "Annual Seed",
                        csv_import: "CSV Import",
                      };
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">{monthLabel}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{entry.leave_types?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{entry.leave_types?.code ?? ""}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {sourceLabel[entry.source] ?? entry.source}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium text-emerald-600 dark:text-emerald-500">
                              +{parseFloat(Number(entry.amount).toFixed(3))}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Ledger Table */}
          {ledger.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No leave transactions found for {selectedEmployee ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}` : "this employee"} in {year}.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Transactions — {selectedEmployee ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}` : ""} ({year})
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                      const fmt3 = (n: number) =>
                        parseFloat(Number(n).toFixed(3)).toString();
                      const daysWithPay = Number(
                        entry.days_with_pay ?? entry.days_applied,
                      );
                      const daysWithoutPay = Math.max(
                        0,
                        Number(entry.days_applied) - daysWithPay,
                      );
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{entry.leave_types?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{entry.leave_types?.code ?? ""}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(entry.start_date), "MMM d")} –{" "}
                            {format(new Date(entry.end_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{fmt3(entry.days_applied)}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {fmt3(daysWithPay)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {daysWithoutPay > 0 ? (
                              <span className="text-amber-600 dark:text-amber-500 font-medium">
                                {fmt3(daysWithoutPay)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[entry.status] ?? "outline"}>
                              {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {formatManilaLongDate(entry.created_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
