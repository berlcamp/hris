import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getReportPlantilla } from "@/lib/actions/dashboard-actions";
import { PlantillaReportClient } from "@/components/reports/plantilla-report-client";

export default async function PlantillaReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const data = await getReportPlantilla();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Plantilla Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All plantilla positions with incumbent data and vacancy status.
          </p>
        </div>
      </div>
      <PlantillaReportClient data={data as any} />
    </div>
  );
}
