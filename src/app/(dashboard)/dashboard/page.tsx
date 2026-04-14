import {
  Users,
  CalendarDays,
  ClipboardCheck,
  Building2,
  TrendingUp,
  ArrowUpRight,
  Clock,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const stats = [
  {
    title: "Total Employees",
    value: "—",
    change: "Active workforce",
    icon: Users,
    accent: "text-[oklch(0.45_0.12_255)]",
    bg: "bg-[oklch(0.45_0.12_255)]/10",
  },
  {
    title: "Active Leaves",
    value: "—",
    change: "This month",
    icon: CalendarDays,
    accent: "text-[oklch(0.65_0.15_160)]",
    bg: "bg-[oklch(0.65_0.15_160)]/10",
  },
  {
    title: "Pending Approvals",
    value: "—",
    change: "Requires action",
    icon: ClipboardCheck,
    accent: "text-[oklch(0.70_0.12_75)]",
    bg: "bg-[oklch(0.70_0.12_75)]/10",
  },
  {
    title: "Departments",
    value: "10",
    change: "Organizational units",
    icon: Building2,
    accent: "text-[oklch(0.60_0.15_300)]",
    bg: "bg-[oklch(0.60_0.15_300)]/10",
  },
];

const quickActions = [
  { title: "Add Employee", icon: Users, href: "/employees/new" },
  { title: "Process Leave", icon: CalendarDays, href: "/leaves" },
  { title: "View DTR", icon: Clock, href: "/attendance" },
  { title: "Generate Report", icon: FileText, href: "/reports" },
];

const recentActivity = [
  { action: "System initialized", detail: "HRIS system ready for configuration", time: "Just now", type: "system" },
  { action: "Seed data loaded", detail: "10 departments and leave types configured", time: "Just now", type: "system" },
  { action: "Super admin created", detail: "admin@lgu.gov.ph", time: "Just now", type: "user" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome to the LGU Human Resource Information System.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.accent}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Quick actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <a
                  key={action.title}
                  href={action.href}
                  className="flex h-auto flex-col items-center justify-center gap-2 rounded-lg border py-4 text-sm hover:bg-primary/5 hover:border-primary/20 transition-colors"
                >
                  <action.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">{action.title}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((item, i) => (
                <div key={i}>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-primary/40" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        {item.action}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.detail}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {item.time}
                    </Badge>
                  </div>
                  {i < recentActivity.length - 1 && (
                    <Separator className="mt-4" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
