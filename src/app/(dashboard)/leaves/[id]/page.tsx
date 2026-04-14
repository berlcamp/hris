import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { getLeaveApplicationById, getEmployeeLeaveCredits } from "@/lib/actions/leave-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { LeaveApprovalActions } from "@/components/leaves/leave-approval-actions";
import { LeavePdfButton } from "@/components/leaves/leave-pdf-button";

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

  // Get leave credits for PDF generation
  const year = new Date(leave.start_date).getFullYear();
  const credits = await getEmployeeLeaveCredits(leave.employee_id, year);
  const credit = credits.find((c) => c.leave_type_id === leave.leave_type_id);

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
            totalCredits={credit ? Number(credit.total_credits) : 0}
            usedCredits={credit ? Number(credit.used_credits) : 0}
            balance={credit ? Number(credit.balance) : 0}
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
            <InfoRow label="Employee No" value={emp?.employee_no} />
            <InfoRow label="Position" value={emp?.positions?.title} />
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
            <InfoRow label="Start Date" value={format(new Date(leave.start_date), "MMMM d, yyyy")} />
            <InfoRow label="End Date" value={format(new Date(leave.end_date), "MMMM d, yyyy")} />
            <InfoRow label="Days Applied" value={`${leave.days_applied} day(s)`} />
            {leave.reason && <InfoRow label="Reason" value={leave.reason} />}
          </CardContent>
        </Card>
      </div>

      {/* Leave Credit Info */}
      {credit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Leave Credit Balance ({year})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{Number(credit.total_credits)}</p>
                <p className="text-xs text-muted-foreground">Total Earned</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{Number(credit.used_credits)}</p>
                <p className="text-xs text-muted-foreground">Used</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{Number(credit.balance)}</p>
                <p className="text-xs text-muted-foreground">Balance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
