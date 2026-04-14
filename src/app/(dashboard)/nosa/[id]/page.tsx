import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { getNosaById } from "@/lib/actions/nosa-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NosaApprovalActions } from "@/components/nosa/nosa-approval-actions";
import { NosaPdfButton } from "@/components/nosa/nosa-pdf-button";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const reasonLabels: Record<string, string> = {
  promotion: "Promotion",
  reclassification: "Reclassification",
  salary_standardization: "Salary Standardization",
  adjustment: "Adjustment",
  demotion: "Demotion",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function NosaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nosa = await getNosaById(id).catch(() => null);
  if (!nosa) notFound();

  const emp = nosa.employees;
  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
  const formatPHP = (n: number) =>
    n > 0 ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "₱0.00";

  const timeline = [
    { label: "Created", done: true, date: nosa.created_at },
    { label: "Submitted", done: nosa.status !== "draft", date: null },
    { label: "Reviewed", done: !!nosa.reviewed_at, date: nosa.reviewed_at },
    { label: "Approved", done: nosa.status === "approved", date: nosa.approved_at },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/nosa">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">NOSA Detail</h1>
            <Badge variant={statusVariant[nosa.status] ?? "outline"}>
              {nosa.status.charAt(0).toUpperCase() + nosa.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(nosa.created_at), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          {nosa.status === "approved" && <NosaPdfButton nosa={nosa} employeeName={fullName} />}
          <NosaApprovalActions nosaId={nosa.id} status={nosa.status} user={user} />
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
          <CardHeader><CardTitle className="text-base">Salary Adjustment Details</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Reason" value={reasonLabels[nosa.reason] ?? nosa.reason} />
            {nosa.legal_basis && <InfoRow label="Legal Basis" value={nosa.legal_basis} />}
            <InfoRow label="Previous SG/Step" value={`SG ${nosa.previous_salary_grade} — Step ${nosa.previous_step}`} />
            <InfoRow label="Previous Salary" value={formatPHP(nosa.previous_salary)} />
            <InfoRow label="New SG/Step" value={`SG ${nosa.new_salary_grade} — Step ${nosa.new_step}`} />
            <InfoRow label="New Salary" value={formatPHP(nosa.new_salary)} />
            <InfoRow
              label="Effective Date"
              value={format(new Date(nosa.effective_date), "MMMM d, yyyy")}
            />
          </CardContent>
        </Card>
      </div>

      {nosa.remarks && (
        <Card>
          <CardHeader><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{nosa.remarks}</p></CardContent>
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
