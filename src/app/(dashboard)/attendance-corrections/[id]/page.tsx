import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  getCorrectionRequest,
  getCorrectionReviewSummary,
} from "@/lib/actions/attendance-correction-actions";
import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";
import { CORRECTION_STATUS_LABELS } from "@/components/tables/columns/attendance-correction-columns";
import { CorrectionReviewActions } from "@/components/attendance-corrections/correction-review-actions";
import { formatManilaLongDate, formatManilaShortDate } from "@/lib/format-date";
import { NO_TIME_REASON_LABELS, type NoTimeReason } from "@/lib/constants";

const statusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  needs_rebase: "destructive",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
};

/** HH:MM out of either a stored TIMESTAMPTZ (the `before` snapshot) or a
 *  TIME column (the proposals). Same first-match rule as the server's hhmmOf. */
function hhmm(value: string | null): string | null {
  return value?.match(/(\d{2}:\d{2})/)?.[1] ?? null;
}

function slotLabel(time: string | null, reason: string | null): string {
  if (reason) {
    const label =
      NO_TIME_REASON_LABELS[reason as NoTimeReason] ?? reason.toUpperCase();
    return time ? `${time} (${label})` : label;
  }
  return time ?? "—";
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="col-span-2 text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function CorrectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // getCorrectionRequest enforces reviewer-or-own-department; anything else
  // (including a bad id) lands on notFound rather than leaking existence.
  const detail = await getCorrectionRequest(id).catch(() => null);
  if (!detail) notFound();
  const { request, items, proofUrl } = detail;

  const summary = await getCorrectionReviewSummary(id);
  const summaryByDate = new Map(summary.days.map((d) => [d.duty_date, d]));

  const isReviewer = canReviewAttendanceCorrection(user.role);
  const isLive = request.status === "pending" || request.status === "needs_rebase";
  const canWithdraw =
    canRequestAttendanceCorrection(user.role) &&
    !!user.departmentId &&
    request.department_id === user.departmentId &&
    isLive;

  const emp = request.employees;
  const fullName = emp ? `${emp.last_name}, ${emp.first_name}` : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/attendance-corrections">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            <Badge variant={statusVariant[request.status] ?? "outline"}>
              {CORRECTION_STATUS_LABELS[request.status] ?? request.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatManilaShortDate(request.date_from)} –{" "}
            {formatManilaShortDate(request.date_to)} · filed{" "}
            {formatManilaLongDate(request.requested_at)}
          </p>
        </div>
        <CorrectionReviewActions
          requestId={request.id}
          status={request.status}
          canReview={isReviewer}
          canWithdraw={canWithdraw}
          totalLateForgiven={summary.totalLateForgiven}
          totalUndertimeForgiven={summary.totalUndertimeForgiven}
          dayCount={items.length}
        />
      </div>

      {request.status === "needs_rebase" && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The attendance for these days changed after this request was filed —
            most likely a biometric re-import — so nothing was applied. Withdraw
            it and file again against the current records.
          </span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">What this changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Days</div>
                <div className="text-lg font-semibold">{items.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  Tardiness waived
                </div>
                <div className="text-lg font-semibold">
                  {summary.totalLateForgiven} min
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  Undertime waived
                </div>
                <div className="text-lg font-semibold">
                  {summary.totalUndertimeForgiven} min
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Before</th>
                    <th className="py-2 pr-3">After</th>
                    <th className="py-2 pr-3 text-right">Late</th>
                    <th className="py-2 text-right">Undertime</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const s = summaryByDate.get(item.duty_date);
                    const before = [
                      hhmm(item.before.time_in_am),
                      hhmm(item.before.time_out_am),
                      hhmm(item.before.time_in_pm),
                      hhmm(item.before.time_out_pm),
                    ]
                      .map((t) => t ?? "—")
                      .join(" / ");
                    const after =
                      item.disposition === "clear_as_off"
                        ? "Cleared as OFF"
                        : [
                            slotLabel(
                              hhmm(item.proposed_time_in_am),
                              item.proposed_in_am_reason,
                            ),
                            slotLabel(
                              hhmm(item.proposed_time_out_am),
                              item.proposed_out_am_reason,
                            ),
                            slotLabel(
                              hhmm(item.proposed_time_in_pm),
                              item.proposed_in_pm_reason,
                            ),
                            slotLabel(
                              hhmm(item.proposed_time_out_pm),
                              item.proposed_out_pm_reason,
                            ),
                          ].join(" / ");
                    return (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 pr-3 whitespace-nowrap font-medium">
                          {formatManilaShortDate(item.duty_date)}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {before}
                        </td>
                        <td className="py-2 pr-3">{after}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          {s ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {s.beforeLate}
                              </span>{" "}
                              <span className="font-medium">{s.afterLate}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {s ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {s.beforeUndertime}
                              </span>{" "}
                              <span className="font-medium">
                                {s.afterUndertime}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Minutes are shown as <em>before → after</em>. They are computed by
              the same code that approval writes, against the schedule each day
              is pinned to — not a separate estimate.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Justification</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{request.reason}</p>
              {proofUrl ? (
                <>
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    {request.proof_filename}
                  </a>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Link expires in 10 minutes.
                  </p>
                </>
              ) : request.direct_apply ? (
                // Not a failure: proof is optional for a direct-apply filing.
                <p className="mt-4 text-sm text-muted-foreground">
                  No supporting document — recorded directly by{" "}
                  {request.requested_by_email ?? "a reviewer"}.
                </p>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  The supporting document could not be loaded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trail</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow
                label="Department"
                value={
                  request.departments
                    ? request.departments.code
                      ? `${request.departments.code} — ${request.departments.name}`
                      : request.departments.name
                    : null
                }
              />
              <InfoRow label="Filed by" value={request.requested_by_email} />
              <InfoRow
                label="Filed"
                value={formatManilaLongDate(request.requested_at)}
              />
              {request.reviewed_at && (
                <>
                  <InfoRow
                    label="Reviewed by"
                    value={request.reviewed_by_email}
                  />
                  <InfoRow
                    label="Reviewed"
                    value={formatManilaLongDate(request.reviewed_at)}
                  />
                </>
              )}
              {request.applied_at && (
                <InfoRow
                  label="Applied"
                  value={formatManilaLongDate(request.applied_at)}
                />
              )}
              {request.review_notes && (
                <InfoRow label="Notes" value={request.review_notes} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
