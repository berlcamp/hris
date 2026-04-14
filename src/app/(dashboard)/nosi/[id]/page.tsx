import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { getNosiById } from "@/lib/actions/nosi-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NosiApprovalActions } from "@/components/nosi/nosi-approval-actions";
import { NosiPdfButton } from "@/components/nosi/nosi-pdf-button";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function NosiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nosi = await getNosiById(id).catch(() => null);
  if (!nosi) notFound();

  const emp = nosi.employees;
  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
  const formatPHP = (n: number) =>
    n > 0 ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "₱0.00";

  const timeline = [
    { label: "Created", done: true, date: nosi.created_at },
    { label: "Submitted", done: nosi.status !== "draft", date: null },
    { label: "Reviewed", done: !!nosi.reviewed_at, date: nosi.reviewed_at },
    { label: "Approved", done: nosi.status === "approved", date: nosi.approved_at },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/nosi">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">NOSI Detail</h1>
            <Badge variant={statusVariant[nosi.status] ?? "outline"}>
              {nosi.status.charAt(0).toUpperCase() + nosi.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(nosi.created_at), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          {nosi.status === "approved" && <NosiPdfButton nosi={nosi} employeeName={fullName} />}
          <NosiApprovalActions nosiId={nosi.id} status={nosi.status} user={user} />
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
          <CardHeader><CardTitle className="text-base">Salary Increment Details</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Salary Grade" value={String(nosi.current_salary_grade)} />
            <InfoRow label="Current Step" value={String(nosi.current_step)} />
            <InfoRow label="New Step" value={String(nosi.new_step)} />
            <InfoRow label="Current Salary" value={formatPHP(nosi.current_salary)} />
            <InfoRow label="New Salary" value={formatPHP(nosi.new_salary)} />
            <InfoRow
              label="Effective Date"
              value={format(new Date(nosi.effective_date), "MMMM d, yyyy")}
            />
            {nosi.last_increment_date && (
              <InfoRow
                label="Last Increment"
                value={format(new Date(nosi.last_increment_date), "MMMM d, yyyy")}
              />
            )}
            {nosi.years_in_step !== null && (
              <InfoRow label="Years in Step" value={`${nosi.years_in_step} years`} />
            )}
          </CardContent>
        </Card>
      </div>

      {nosi.remarks && (
        <Card>
          <CardHeader><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{nosi.remarks}</p></CardContent>
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
