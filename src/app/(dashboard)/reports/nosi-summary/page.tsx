import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { NosiSummaryClient } from "@/components/reports/nosi-summary-client";

export default async function NosiSummaryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NOSI Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All Notice of Step Increment records with date range filtering.
          </p>
        </div>
      </div>
      <NosiSummaryClient />
    </div>
  );
}
