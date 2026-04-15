import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getIpcrPeriods } from "@/lib/actions/ipcr-actions";
import { IpcrSummaryClient } from "@/components/reports/ipcr-summary-client";

export default async function IpcrSummaryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const periods = await getIpcrPeriods();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IPCR Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance ratings by evaluation period with average computation.
          </p>
        </div>
      </div>
      <IpcrSummaryClient periods={periods} />
    </div>
  );
}
