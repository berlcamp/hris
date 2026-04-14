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

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getLeaveLedger, getEmployeeLeaveCredits } from "@/lib/actions/leave-actions";
import { getEmployees } from "@/lib/actions/employee-actions";
import { LeaveLedgerClient } from "@/components/leaves/leave-ledger-client";

export default async function LeaveLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ employee_id?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const { employee_id, year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  const employees = await getEmployees();

  let ledger: Awaited<ReturnType<typeof getLeaveLedger>> = [];
  let credits: Awaited<ReturnType<typeof getEmployeeLeaveCredits>> = [];

  if (employee_id) {
    [ledger, credits] = await Promise.all([
      getLeaveLedger(employee_id, year),
      getEmployeeLeaveCredits(employee_id, year),
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
        ledgerData={ledger.map((entry) => ({
          id: entry.id,
          leave_type: entry.leave_types?.name ?? "Unknown",
          leave_code: entry.leave_types?.code ?? "",
          start_date: entry.start_date,
          end_date: entry.end_date,
          days_applied: entry.days_applied,
          status: entry.status,
          created_at: entry.created_at,
        }))}
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
                      <span className="text-sm text-muted-foreground">/ {Number(c.total_credits)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Number(c.used_credits)} used
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Filed On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((entry) => (
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
                          <Badge variant="outline">{entry.days_applied}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[entry.status] ?? "outline"}>
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(entry.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
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
