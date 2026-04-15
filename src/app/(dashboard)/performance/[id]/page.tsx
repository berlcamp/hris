import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { getIpcrRecordById } from "@/lib/actions/ipcr-actions";
import { getRatingColor } from "@/lib/ipcr-utils";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { IpcrApprovalActions } from "@/components/performance/ipcr-approval-actions";
import { IpcrRatingEditor } from "@/components/performance/ipcr-rating-editor";

const statusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function IpcrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const record = await getIpcrRecordById(id).catch(() => null);
  if (!record) notFound();

  const emp = record.employees;
  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
  const period = record.ipcr_periods;
  const ratingColorClass = getRatingColor(record.adjectival_rating);

  const canEditRating =
    record.status === "draft" &&
    ["super_admin", "hr_admin", "department_head"].includes(user.role);

  const timeline = [
    { label: "Created", done: true, date: record.created_at },
    { label: "Submitted", done: record.status !== "draft", date: null },
    {
      label: "Approved",
      done: record.status === "approved",
      date: record.status === "approved" ? record.updated_at : null,
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/performance">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">IPCR Detail</h1>
            <Badge variant={statusVariant[record.status] ?? "outline"}>
              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(record.created_at), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <IpcrRatingEditor
            recordId={record.id}
            currentRating={record.numerical_rating}
            currentRemarks={record.remarks}
            editable={canEditRating}
          />
          <IpcrApprovalActions
            recordId={record.id}
            status={record.status}
            user={user}
            hasRating={record.numerical_rating !== null}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Employee Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Employee Information</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Name" value={fullName} />
            <InfoRow label="Employee No" value={emp?.employee_no} />
            <InfoRow label="Position" value={emp?.positions?.title} />
            <InfoRow
              label="Department"
              value={
                emp?.departments
                  ? `${emp.departments.code} — ${emp.departments.name}`
                  : null
              }
            />
          </CardContent>
        </Card>

        {/* Rating Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Rating</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Period" value={period?.name} />
            {period && (
              <InfoRow
                label="Coverage"
                value={`${format(new Date(period.start_date), "MMM d, yyyy")} – ${format(new Date(period.end_date), "MMM d, yyyy")}`}
              />
            )}
            <div className="grid grid-cols-2 gap-4 py-2">
              <span className="text-sm text-muted-foreground">
                Numerical Rating
              </span>
              <span className="text-sm font-medium font-mono">
                {record.numerical_rating !== null
                  ? record.numerical_rating.toFixed(2)
                  : "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 py-2">
              <span className="text-sm text-muted-foreground">
                Adjectival Rating
              </span>
              {record.adjectival_rating ? (
                <Badge
                  variant="outline"
                  className={`text-sm w-fit ${ratingColorClass}`}
                >
                  {record.adjectival_rating}
                </Badge>
              ) : (
                <span className="text-sm font-medium">—</span>
              )}
            </div>
            {record.reviewer && (
              <InfoRow
                label="Reviewed By"
                value={record.reviewer.full_name}
              />
            )}
            {record.approver && (
              <InfoRow
                label="Approved By"
                value={record.approver.full_name}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Remarks */}
      {record.remarks && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{record.remarks}</p>
          </CardContent>
        </Card>
      )}

      {/* Approval Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      step.done ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground mt-1">
                    {step.label}
                  </span>
                  {step.date && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(step.date), "MMM d")}
                    </span>
                  )}
                </div>
                {i < timeline.length - 1 && (
                  <Separator
                    className={`flex-1 ${
                      timeline[i + 1].done
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rating Scale Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating Scale Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { range: "4.500 - 5.000", label: "Outstanding", color: "text-green-700 bg-green-100" },
              { range: "3.500 - 4.499", label: "Very Satisfactory", color: "text-blue-700 bg-blue-100" },
              { range: "2.500 - 3.499", label: "Satisfactory", color: "text-yellow-700 bg-yellow-100" },
              { range: "1.500 - 2.499", label: "Unsatisfactory", color: "text-orange-700 bg-orange-100" },
              { range: "Below 1.500", label: "Poor", color: "text-red-700 bg-red-100" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-lg p-2 text-center ${item.color}`}
              >
                <p className="text-xs font-medium">{item.label}</p>
                <p className="text-xs opacity-75">{item.range}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
