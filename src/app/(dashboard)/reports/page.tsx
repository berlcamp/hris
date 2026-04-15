import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  FileText,
  TrendingUp,
  CalendarDays,
  Clock,
  Star,
  ArrowRight,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/actions/auth-actions";

const reports = [
  {
    title: "Plantilla Report",
    description: "All plantilla positions with incumbent data and vacancy status",
    href: "/reports/plantilla",
    icon: Users,
  },
  {
    title: "Leave Ledger",
    description: "Per-employee leave transaction history with balance tracking",
    href: "/reports/leave-ledger",
    icon: CalendarDays,
  },
  {
    title: "NOSI Summary",
    description: "All Notice of Step Increment records by date range",
    href: "/reports/nosi-summary",
    icon: TrendingUp,
  },
  {
    title: "NOSA Summary",
    description: "All Notice of Salary Adjustment records by date range",
    href: "/reports/nosa-summary",
    icon: FileText,
  },
  {
    title: "DTR Summary",
    description: "Monthly attendance summary with late/undertime aggregation",
    href: "/reports/dtr-summary",
    icon: Clock,
  },
  {
    title: "IPCR Summary",
    description: "Performance ratings by evaluation period",
    href: "/reports/ipcr-summary",
    icon: Star,
  },
];

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate compliance-ready reports with filtering and export options.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full hover:border-primary/30 hover:shadow-sm transition-all group cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <report.icon className="h-5 w-5 text-primary" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <CardTitle className="text-base mt-3">{report.title}</CardTitle>
                <CardDescription className="text-xs">
                  {report.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
