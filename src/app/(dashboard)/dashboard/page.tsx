import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  Users,
  CalendarDays,
  ClipboardCheck,
  Building2,
  Clock,
  FileText,
  TrendingUp,
  ArrowRight,
  CalendarClock,
  Star,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  getDashboardStats,
  getEmployeesByDepartment,
  getEmployeesByType,
  getPendingApprovals,
  getEmployeeDashboardData,
} from "@/lib/actions/dashboard-actions";
import { DepartmentBarChart, EmployeeTypePieChart } from "@/components/dashboard/dashboard-charts";
import { getRatingColor } from "@/lib/ipcr-utils";

const quickActions = [
  { title: "Add Employee", icon: Users, href: "/employees/new", roles: ["super_admin", "hr_admin"] },
  { title: "Process Leave", icon: CalendarDays, href: "/leaves", roles: ["super_admin", "hr_admin", "department_head", "employee"] },
  { title: "View DTR", icon: Clock, href: "/attendance", roles: ["super_admin", "hr_admin", "department_head", "employee"] },
  { title: "Generate Report", icon: FileText, href: "/reports", roles: ["super_admin", "hr_admin"] },
  { title: "NOSI", icon: TrendingUp, href: "/nosi", roles: ["super_admin", "hr_admin"] },
  { title: "IPCR", icon: Star, href: "/performance", roles: ["super_admin", "hr_admin", "department_head"] },
];

const approvalLinks: Record<string, string> = {
  leave: "/leaves",
  nosi: "/nosi",
  nosa: "/nosa",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);
  const isDeptHead = user.role === "department_head";
  const isEmployee = user.role === "employee";

  const stats = await getDashboardStats(user);

  // Admin/DeptHead data
  let deptData: Awaited<ReturnType<typeof getEmployeesByDepartment>> = [];
  let typeData: Awaited<ReturnType<typeof getEmployeesByType>> = [];
  let pendingApprovals: Awaited<ReturnType<typeof getPendingApprovals>> = [];

  if (isAdmin || isDeptHead) {
    [deptData, typeData, pendingApprovals] = await Promise.all([
      getEmployeesByDepartment(),
      getEmployeesByType(),
      getPendingApprovals(user),
    ]);
  }

  // Employee data
  let empData: Awaited<ReturnType<typeof getEmployeeDashboardData>> = null;
  if (isEmployee) {
    empData = await getEmployeeDashboardData(user.id);
  }

  const totalPending = stats.pendingLeaves + stats.pendingNosi + stats.pendingNosa + stats.pendingIpcr;
  const filteredActions = quickActions.filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user.fullName}.
        </p>
      </div>

      {/* Stats — Admin/DeptHead */}
      {(isAdmin || isDeptHead) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Employees
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeEmployees}</div>
              <div className="mt-1 flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  P: {stats.plantillaCount}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  JO: {stats.joCount}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  COS: {stats.cosCount}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Leaves
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                <CalendarDays className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.pendingLeaves}</div>
              <p className="mt-1 text-xs text-muted-foreground">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Approvals
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <ClipboardCheck className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalPending}</div>
              <div className="mt-1 flex gap-1.5">
                {stats.pendingNosi > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    NOSI: {stats.pendingNosi}
                  </Badge>
                )}
                {stats.pendingNosa > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    NOSA: {stats.pendingNosa}
                  </Badge>
                )}
                {stats.pendingIpcr > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    IPCR: {stats.pendingIpcr}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Departments
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                <Building2 className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.departmentCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">Organizational units</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee stats */}
      {isEmployee && empData && (
        <div className="space-y-6">
          {/* Leave balances */}
          {empData.leaveBalances.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Leave Balances
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {empData.leaveBalances.map((lb) => (
                  <Card key={lb.code}>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground">{lb.leave_type}</p>
                        <Badge variant="outline" className="text-[10px]">{lb.code}</Badge>
                      </div>
                      <p className="text-2xl font-bold">{lb.balance}</p>
                      <Progress value={lb.total > 0 ? ((lb.total - lb.used) / lb.total) * 100 : 0} className="mt-2 h-1.5" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {lb.used} used / {lb.total} total
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Next step increment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Next Step Increment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {empData.nextIncrementDate ? (
                  <div>
                    <p className="text-lg font-bold">
                      {format(new Date(empData.nextIncrementDate), "MMMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">Estimated eligibility date</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">At maximum step or no data</p>
                )}
              </CardContent>
            </Card>

            {/* Latest IPCR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Latest IPCR Rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                {empData.latestIpcr ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold font-mono">
                        {empData.latestIpcr.rating?.toFixed(2) ?? "—"}
                      </p>
                      {empData.latestIpcr.adjectival && (
                        <Badge variant="outline" className={getRatingColor(empData.latestIpcr.adjectival)}>
                          {empData.latestIpcr.adjectival}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {empData.latestIpcr.period}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No approved IPCR records</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pending applications */}
          {empData.pendingApplications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending Applications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {empData.pendingApplications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{app.detail}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(app.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge variant={app.status === "pending" ? "secondary" : "outline"}>
                        {app.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts and quick actions — Admin/DeptHead */}
      {(isAdmin || isDeptHead) && (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Quick actions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {filteredActions.map((action) => (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="flex h-auto flex-col items-center justify-center gap-2 rounded-lg border py-4 text-sm hover:bg-primary/5 hover:border-primary/20 transition-colors"
                    >
                      <action.icon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs font-medium">{action.title}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pending approvals */}
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pending Approvals</CardTitle>
                  <CardDescription>{pendingApprovals.length} item(s) need attention</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {pendingApprovals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No pending approvals.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pendingApprovals.slice(0, 8).map((item, i) => (
                      <div key={`${item.type}-${item.id}`}>
                        <Link
                          href={`${approvalLinks[item.type]}/${item.id}`}
                          className="flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge
                              variant={
                                item.type === "leave"
                                  ? "secondary"
                                  : item.type === "nosi"
                                  ? "default"
                                  : "outline"
                              }
                              className="text-[10px] shrink-0 w-12 justify-center"
                            >
                              {item.type.toUpperCase()}
                            </Badge>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                {item.employee_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {item.detail}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(item.created_at), "MMM d")}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                        {i < Math.min(pendingApprovals.length, 8) - 1 && (
                          <Separator className="mt-3" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          {isAdmin && (
            <div className="grid gap-6 lg:grid-cols-2">
              <DepartmentBarChart data={deptData} />
              <EmployeeTypePieChart data={typeData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
