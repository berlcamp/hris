import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { formatManilaLongDate, formatManilaShortDate } from "@/lib/format-date";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { getCtoApplicationById, getCtoBalance } from "@/lib/actions/cto-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEffectivePosition } from "@/lib/employee-position";
import { CtoApprovalActions } from "@/components/cto/cto-approval-actions";
import { CtoPdfButton } from "@/components/cto/cto-pdf-button";
import { CtoAuditTrail } from "@/components/cto/cto-audit-trail";

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

export default async function CtoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cto = await getCtoApplicationById(id).catch(() => null);
  if (!cto) notFound();

  const emp = cto.employees;
  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  const balanceResult = await getCtoBalance(cto.employee_id);
  const balance = "error" in balanceResult ? null : balanceResult;

  const hours = Number(cto.hours_applied);
  const showProjection = cto.status === "pending";

  const canCancel = cto.status === "pending" && cto.created_by === user.id;

  const timeline = [
    { label: "Submitted", done: true, date: cto.created_at },
    { label: "Dept Approved", done: !!cto.dept_approved_at, date: cto.dept_approved_at },
    { label: "HR Approved", done: cto.status === "approved", date: cto.hr_approved_at },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/cto">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">CTO Application</h1>
            <Badge variant={statusVariant[cto.status] ?? "outline"}>
              {cto.status.charAt(0).toUpperCase() + cto.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Filed {formatManilaLongDate(cto.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <CtoPdfButton cto={cto} availableBalance={balance?.available ?? null} />
          <CtoApprovalActions
            ctoId={cto.id}
            status={cto.status}
            deptApprovedAt={cto.dept_approved_at}
            canCancel={canCancel}
            user={user}
            restrictToUserId={
              cto.created_by_profile?.role === "ocm_admin"
                ? (cto.created_by ?? null)
                : null
            }
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
          <CardHeader><CardTitle className="text-base">CTO Details</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <InfoRow
              label="Inclusive Dates"
              value={
                cto.cto_dates && cto.cto_dates.length > 0
                  ? cto.cto_dates.map((d: string) => format(new Date(d + "T00:00:00"), "MMM d, yyyy")).join(", ")
                  : `${format(new Date(cto.start_date), "MMM d, yyyy")} to ${format(new Date(cto.end_date), "MMM d, yyyy")}`
              }
            />
            <InfoRow
              label="Hours Applied"
              value={`${hours} hour(s) — ${hours / 8} day(s)`}
            />
            {cto.reason && <InfoRow label="Reason" value={cto.reason} />}
          </CardContent>
        </Card>
      </div>

      {/* COC balance panel — helps the approver confirm sufficient credits. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">COC Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {balance === null ? (
            <p className="text-sm text-muted-foreground">
              COC balance unavailable.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Available now</p>
                <p className="text-lg font-semibold">{balance.available}h</p>
              </div>
              {showProjection && (
                <>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">This application</p>
                    <p className="text-lg font-semibold text-amber-700 dark:text-amber-500">
                      −{hours}h
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Balance after</p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        balance.available - hours < 0 && "text-destructive"
                      )}
                    >
                      {balance.available - hours}h
                    </p>
                  </div>
                </>
              )}
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Expiring in 30 days</p>
                <p className="text-lg font-semibold">{balance.expiringSoon}h</p>
              </div>
            </div>
          )}
          {showProjection && balance !== null && hours > balance.available && (
            <p className="mt-3 text-sm text-destructive">
              Insufficient COC balance — this application cannot be approved
              until more credits are earned or others are freed up.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            COC is non-convertible to cash, cannot offset tardiness/undertime,
            and expires one year from the date the overtime was rendered
            (CSC-DBM JC No. 2, s. 2004).
          </p>
        </CardContent>
      </Card>

      {/* Rejection / Cancellation Reason */}
      {cto.rejection_reason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {cto.status === "cancelled" ? "Cancellation Reason" : "Rejection Reason"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{cto.rejection_reason}</p>
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
                      {formatManilaShortDate(step.date)}
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
      <CtoAuditTrail ctoId={cto.id} />
    </div>
  );
}
