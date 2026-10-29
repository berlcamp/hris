import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getPositionReportItems } from "@/lib/actions/plantilla-actions";
import { PositionSummaryReportClient } from "@/components/reports/position-summary-report-client";
import { hasAnyRole } from "@/lib/auth-helpers";
import { summarizePositions } from "@/lib/position-summary";

export default async function PositionSummaryReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasAnyRole(user.roles, "super_admin", "hr_admin")) redirect("/dashboard");

  const rows = summarizePositions(await getPositionReportItems());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Position Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plantilla items grouped by position title. Download the incumbents of
            any position as an Excel file.
          </p>
        </div>
      </div>
      <PositionSummaryReportClient rows={rows} />
    </div>
  );
}
