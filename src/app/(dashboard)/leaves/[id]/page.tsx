import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { getLeaveApplicationById, getEmployeeLeaveCredits } from "@/lib/actions/leave-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEffectivePosition } from "@/lib/employee-position";
import { LeaveApprovalActions } from "@/components/leaves/leave-approval-actions";
import { LeavePdfButton } from "@/components/leaves/leave-pdf-button";
import { LeaveAuditTrail } from "@/components/leaves/leave-audit-trail";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function LeaveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const leave = await getLeaveApplicationById(id).catch(() => null);
  if (!leave) notFound();

  const emp = leave.employees;
  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  // Get leave credits for PDF generation and display
  const year = new Date(leave.start_date).getFullYear();
  const allCredits = await getEmployeeLeaveCredits(leave.employee_id, year);
  const credit = allCredits.find((c) => c.leave_type_id === leave.leave_type_id);

  // The view's `balance` already subtracts approved leave usage, so projecting
  // "balance after this leave" only makes sense before a decision is made.
  const showProjection = leave.status === "draft" || leave.status === "pending";

  const timeline = [
    { label: "Submitted", done: true, date: leave.created_at },
    { label: "Dept Approved", done: !!leave.dept_approved_at, date: leave.dept_approved_at },
    { label: "HR Approved", done: leave.status === "approved", date: leave.hr_approved_at },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/leaves">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Leave Application</h1>
            <Badge variant={statusVariant[leave.status] ?? "outline"}>
              {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Filed {format(new Date(leave.created_at), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <LeavePdfButton
            leave={leave}
            credits={allCredits}
          />
          <LeaveApprovalActions
            leaveId={leave.id}
            status={leave.status}
            deptApprovedAt={leave.dept_approved_at}
            employeeId={leave.employee_id}
            user={user}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Employee Information</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Name" value={fullName} />
            <InfoRow
              label="Employee No"
              value={emp != null ? String(emp.biometric_no) : undefined}
            />
            <InfoRow label="Position" value={emp ? getEffectivePosition(emp) : null} />
            <InfoRow
              label="Department"
              value={emp?.departments ? `${emp.departments.code} — ${emp.departments.name}` : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Leave Details</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Leave Type" value={leave.leave_types ? `${leave.leave_types.name} (${leave.leave_types.code})` : null} />
            <InfoRow
              label="Inclusive Dates"
              value={
                leave.leave_dates && leave.leave_dates.length > 0
                  ? leave.leave_dates.map((d: string) => format(new Date(d + "T00:00:00"), "MMM d, yyyy")).join(", ")
                  : `${format(new Date(leave.start_date), "MMM d, yyyy")} to ${format(new Date(leave.end_date), "MMM d, yyyy")}`
              }
            />
            <InfoRow label="Days Applied" value={`${leave.days_applied} day(s)`} />
            {leave.details_of_leave && <InfoRow label="Details of Leave" value={leave.details_of_leave} />}
            <InfoRow label="Commutation" value={leave.commutation_requested ? "Requested" : "Not Requested"} />
            {leave.reason && <InfoRow label="Reason" value={leave.reason} />}
          </CardContent>
        </Card>
      </div>

      {/* Leave Credit Balances — all leave types for the employee, with the
          requested type highlighted. Helps HR confirm sufficient balance
          before approving. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Current Leave Balances ({year})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allCredits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leave credits on record for {year}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead className="text-right">Total Earned</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {showProjection && (
                    <TableHead className="text-right">
                      Balance After This Leave
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allCredits
                  .slice()
                  .sort((a, b) =>
                    (a.leave_types?.code ?? "").localeCompare(
                      b.leave_types?.code ?? ""
                    )
                  )
                  .map((c) => {
                    const isRequested = c.leave_type_id === leave.leave_type_id;
                    const balance = Number(c.balance);
                    // Only the paid portion deducts from credits; LWOP days don't.
                    const projected =
                      showProjection && isRequested
                        ? balance - Number(leave.days_with_pay ?? leave.days_applied)
                        : null;
                    return (
                      <TableRow
                        key={c.id}
                        className={cn(
                          isRequested && "bg-muted/60 font-medium"
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>
                              {c.leave_types?.name ?? "—"}{" "}
                              {c.leave_types?.code && (
                                <span className="text-muted-foreground">
                                  ({c.leave_types.code})
                                </span>
                              )}
                            </span>
                            {isRequested && (
                              <Badge variant="outline" className="text-xs">
                                Requested
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(c.total_credits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(c.used_credits)}
                        </TableCell>
                        <TableCell className="text-right">{balance}</TableCell>
                        {showProjection && (
                          <TableCell className="text-right">
                            {projected === null ? (
                              "—"
                            ) : (
                              <span
                                className={cn(
                                  projected < 0 && "text-destructive font-semibold"
                                )}
                              >
                                {projected}
                              </span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
          {showProjection &&
            leave.days_applied > Number(leave.days_with_pay ?? leave.days_applied) && (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-500">
                Note: {leave.days_applied - Number(leave.days_with_pay ?? leave.days_applied)} day(s)
                will be leave without pay (excess over available credits).
              </p>
            )}
        </CardContent>
      </Card>

      {/* Rejection Reason */}
      {leave.rejection_reason && (
        <Card>
          <CardHeader><CardTitle className="text-base">Rejection Reason</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{leave.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Approval Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Approval Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={`h-3 w-3 rounded-full ${step.done ? "bg-primary" : "bg-muted-foreground/30"}`} />
                  <span className="text-xs text-muted-foreground mt-1">{step.label}</span>
                  {step.date && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(step.date), "MMM d")}
                    </span>
                  )}
                </div>
                {i < timeline.length - 1 && (
                  <Separator className={`flex-1 ${timeline[i + 1].done ? "bg-primary" : "bg-muted-foreground/30"}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activity Log (audit trail) */}
      <LeaveAuditTrail leaveId={leave.id} />
    </div>
  );
}
