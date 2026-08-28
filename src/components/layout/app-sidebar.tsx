"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FileText,
  CalendarDays,
  Clock,
  BarChart3,
  Settings,
  Shield,
  ChevronUp,
  LogOut,
  TrendingUp,
  ClipboardList,
  CreditCard,
  Building2,
  Landmark,
  User,
  ScrollText,
  ScanSearch,
  Upload,
  CircleDollarSign,
  Briefcase,
  CalendarClock,
  CalendarOff,
  Network,
  UserSearch,
  Timer,
  Hourglass,
  FileSignature,
  HardHat,
  MapPin,
  LayoutTemplate,
  Hammer,
  ClipboardCheck,
  FileClock,
  Mail,
  PartyPopper,
  QrCode,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useUser, type AuthUser } from "@/hooks/use-user";
import { signOut } from "@/lib/actions/auth-actions";
import { canOpenAttendanceCorrections } from "@/lib/auth-helpers";
import type { UserRole } from "@/lib/types";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  /**
   * Extra per-ACCOUNT gate, applied on top of `roles`. For items whose access
   * is not decided by role alone — today only Attendance Corrections, which a
   * Department Admin can have switched off on its user profile.
   */
  visible?: (user: AuthUser | null) => boolean;
}

interface NavGroup {
  label: string;
  roles: UserRole[];
  items: NavItem[];
}

const allRoles: UserRole[] = [
  "super_admin",
  "ocm_admin",
  "hr_admin",
  "hr_record_manager",
  "department_head",
  "department_admin",
  "department_admin_and_department_head",
  "dtr_manager",
  "cos_manager",
  "jo_manager",
  "event_attendance_officer",
  "employee",
];
const adminRoles: UserRole[] = ["super_admin", "hr_admin"];
// HR records reach: employees, plantilla, salary grades and NOSI. The dedicated
// HR Record Manager role joins the two admin roles for these items only — it
// gets none of the other modules (attendance, leave, CTO/COC, RSP, payroll,
// reports, or the rest of Administration).
const hrRecordsRoles: UserRole[] = ["super_admin", "hr_admin", "hr_record_manager"];
const deptManagerRoles: UserRole[] = [
  "super_admin",
  "hr_admin",
  "department_head",
  "department_admin",
  "department_admin_and_department_head",
];
// Who can see the Employees list. OCM Admin and DTR Manager get read access plus
// the single-field "detailed department" quick edit (see canEditDetailedDepartment).
const employeesViewRoles: UserRole[] = [
  ...deptManagerRoles,
  "ocm_admin",
  "dtr_manager",
  "hr_record_manager",
];
// Events. The Attendance Checker never sees this sidebar at all: the role has
// its own app at /scan and (dashboard)/layout.tsx redirects it there before any
// of this renders. It is listed here only so the sets stay readable — it is
// scan-only, with no employees, no attendance/DTR, no payroll, and not even the
// attendance report for the event it just worked. Card printing and every event
// write stay with HR.
const eventManagerRoles: UserRole[] = ["super_admin", "hr_admin"];
const eventAccessRoles: UserRole[] = [...eventManagerRoles, "event_attendance_officer"];
const leaveAttendanceRoles: UserRole[] = [
  "super_admin",
  "ocm_admin",
  "hr_admin",
  "department_head",
  "department_admin",
  "department_admin_and_department_head",
  "employee",
];
// Attendance & DTR is visible to HR/admin roles, employees (their own DTR) and
// the dedicated DTR Manager role — but NOT to the department-scoped roles
// (department_head, department_admin, composite), which have no attendance
// access. The DTR Manager has no access to the Leave items in this group.
const attendanceRoles: UserRole[] = [
  "super_admin",
  "ocm_admin",
  "hr_admin",
  "employee",
  "dtr_manager",
];
// Who reaches the Monthly DTR item: every role except the JO and COS managers,
// whose reach stops at their own registry. Mirrors canAccessDtr in
// src/lib/auth-helpers.ts; keep the two in sync.
const dtrRoles: UserRole[] = allRoles.filter(
  (r) => r !== "jo_manager" && r !== "cos_manager",
);
// The Leave & Attendance nav group must remain visible to department-scoped
// roles for the Leave items, even though they can't see Attendance & DTR.
// Since /dtr below is open to every role but those two, the group is reachable
// by the same set — the per-item filter in the render still decides what each
// role actually sees, so nobody gains an item this way, and a group left with
// no visible items is dropped entirely.
const leaveAttendanceGroupRoles: UserRole[] = dtrRoles;
// Contract of Service module. Mirrors canManageCos() in src/lib/auth-helpers.ts
// — keep the two in sync.
const cosRoles: UserRole[] = ["super_admin", "hr_admin", "cos_manager"];
// Templates are the narrower privilege — see canManageCosTemplates in
// src/lib/auth-helpers.ts. A cos_manager uses templates but cannot rewrite the
// legal boilerplate.
const cosTemplateRoles: UserRole[] = ["super_admin", "hr_admin"];
// Roles that can manage the Job Orders module: JO employees and Area
// Assignments today; payrolls, memos and special orders join in later specs.
// Mirrors canManageJobOrders in src/lib/auth-helpers.ts.
const jobOrderRoles: UserRole[] = ["super_admin", "hr_admin", "jo_manager"];
// Attendance corrections. The union of every side of the workflow —
// requesters (department-scoped admins), reviewers, and read-only viewers —
// because they all land on the same /attendance-corrections route, which
// branches on role. Mirrors canOpenAttendanceCorrections in
// src/lib/auth-helpers.ts; keep the two in sync.
//
// Note the department-scoped roles here are NOT in attendanceRoles above: they
// can file a correction without gaining any other attendance reach, which is
// why this route sits at the top level and not under /attendance.
const correctionRoles: UserRole[] = [
  "department_admin",
  "department_admin_and_department_head",
  // Read-only over its own department: sees what was filed and how HR decided
  // it, but gets no "New Request" button — see canViewAttendanceCorrections.
  "department_head",
  "super_admin",
  "hr_admin",
  "dtr_manager",
  // Records attendance across departments through direct-apply — see
  // canDirectApplyAttendanceCorrection. Without this it would lose the reach it
  // has today through Manual Attendance Entry.
  "ocm_admin",
];

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    roles: allRoles,
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: allRoles },
    ],
  },
  {
    label: "Employee Management",
    roles: employeesViewRoles,
    items: [
      { title: "Employees", href: "/employees", icon: Users, roles: employeesViewRoles },
      { title: "Plantilla", href: "/plantilla", icon: ScrollText, roles: hrRecordsRoles },
      { title: "Recruitment (RSP)", href: "/rsp", icon: UserSearch, roles: adminRoles },
      {
        title: "Employee ID Generator",
        href: "/employee-id-generator",
        icon: ScanSearch,
        roles: ["super_admin"],
      },
      { title: "NOSI", href: "/nosi", icon: TrendingUp, roles: hrRecordsRoles },
      { title: "NOSA", href: "/nosa", icon: FileText, roles: adminRoles },
      // Salary Grades lives under Administration for admins; the HR Record
      // Manager reaches it here so it needs no Administration group at all.
      {
        title: "Salary Grades",
        href: "/admin/salary-grades",
        icon: Building2,
        roles: ["hr_record_manager"],
      },
    ],
  },
  {
    label: "My Records",
    roles: ["employee"],
    items: [
      { title: "My Profile", href: "/employees/me", icon: User, roles: ["employee"] },
    ],
  },
  {
    label: "Leave & Attendance",
    roles: leaveAttendanceGroupRoles,
    items: [
      { title: "Leave Management", href: "/leaves", icon: CalendarDays, roles: leaveAttendanceRoles },
      {
        title: "Leave Credits",
        href: "/leaves/credits",
        icon: CreditCard,
        roles: ["super_admin"],
      },
      { title: "CTO Management", href: "/cto", icon: Timer, roles: leaveAttendanceRoles },
      {
        title: "COC Credits",
        href: "/cto/credits",
        icon: Hourglass,
        roles: ["super_admin", "hr_admin"],
      },
      { title: "Attendance & DTR", href: "/attendance", icon: Clock, roles: attendanceRoles },
      // Open to every role — see the header of src/lib/actions/dtr-actions.ts
      // for the three tiers it serves. Replaced the Weekly DTR item, which sat
      // here and reached the department-scoped roles that attendanceRoles
      // excludes; those roles still reach this one, by a month instead.
      { title: "DTR", href: "/dtr", icon: FileClock, roles: dtrRoles },
      {
        title: "Attendance Corrections",
        href: "/attendance-corrections",
        icon: ClipboardCheck,
        roles: correctionRoles,
        // A Department Admin's access is per account, not per role — HR can
        // switch it off from /admin/users. The role list above is the ceiling;
        // this is the account's own answer, and it is the same call the route
        // itself makes before redirecting.
        visible: (user) => !!user && canOpenAttendanceCorrections(user),
      },
    ],
  },
  {
    label: "Performance",
    roles: ["super_admin"],
    items: [
      {
        title: "IPCR",
        href: "/performance",
        icon: ClipboardList,
        roles: [
          "super_admin",
          "hr_admin",
          "department_head",
          "department_admin_and_department_head",
          "employee",
        ],
      },
    ],
  },
  {
    label: "Payroll",
    roles: adminRoles,
    items: [
      { title: "Regular Payroll", href: "/payroll", icon: CircleDollarSign, roles: adminRoles },
      { title: "COS Payroll", href: "/cos-payroll", icon: Briefcase, roles: adminRoles },
    ],
  },
  {
    label: "Contract of Service",
    roles: cosRoles,
    items: [
      {
        title: "COS Employees",
        href: "/cos/employees",
        icon: FileSignature,
        roles: cosRoles,
      },
      {
        title: "Contracts",
        href: "/cos/contracts",
        icon: FileText,
        roles: cosRoles,
      },
      {
        title: "Contract Templates",
        href: "/cos/templates",
        icon: LayoutTemplate,
        roles: cosTemplateRoles,
      },
    ],
  },
  {
    label: "Job Orders",
    roles: jobOrderRoles,
    items: [
      { title: "Job Order Employees", href: "/job-orders", icon: HardHat, roles: jobOrderRoles },
      { title: "Area Assignments", href: "/job-orders/areas", icon: MapPin, roles: jobOrderRoles },
      { title: "Payroll", href: "/job-orders/payroll", icon: Hammer, roles: jobOrderRoles },
      { title: "Memorandum", href: "/job-orders/memos", icon: Mail, roles: jobOrderRoles },
    ],
  },
  {
    label: "Events",
    roles: eventAccessRoles,
    items: [
      { title: "Events", href: "/events", icon: PartyPopper, roles: eventAccessRoles },
      { title: "QR ID Cards", href: "/events/cards", icon: QrCode, roles: eventManagerRoles },
    ],
  },
  {
    label: "Reports",
    roles: deptManagerRoles,
    items: [
      { title: "Reports", href: "/reports", icon: BarChart3, roles: adminRoles },
      { title: "Leave Ledger", href: "/reports/leave-ledger", icon: FileText, roles: deptManagerRoles },
    ],
  },
  {
    label: "Administration",
    // DTR Manager sees Work Schedules, Holidays and Departments within this
    // group; OCM Admin only sees Departments; every other item stays
    // super_admin-only.
    roles: ["super_admin", "dtr_manager", "ocm_admin"],
    items: [
      { title: "User Management", href: "/admin/users", icon: UserPlus, roles: ["super_admin"] },
      { title: "Departments", href: "/admin/departments", icon: Network, roles: ["super_admin", "ocm_admin", "dtr_manager"] },
      { title: "Salary Grades", href: "/admin/salary-grades", icon: Building2, roles: ["super_admin"] },
      {
        title: "Salary CSV import",
        href: "/admin/salary-import",
        icon: Upload,
        roles: ["super_admin"],
      },
      {
        title: "Leave Credits Import",
        href: "/admin/leave-credits-import",
        icon: Upload,
        roles: ["super_admin"],
      },
      {
        title: "Job Order Import",
        href: "/admin/job-order-import",
        icon: Upload,
        roles: ["super_admin"],
      },
      {
        title: "Job Order Payroll Import",
        href: "/admin/job-order-payroll-import",
        icon: Upload,
        roles: ["super_admin"],
      },
      { title: "Work Schedules", href: "/admin/schedules", icon: CalendarClock, roles: ["super_admin", "dtr_manager"] },
      { title: "Holidays", href: "/attendance/holidays", icon: CalendarOff, roles: ["super_admin", "dtr_manager"] },
      { title: "IPCR Periods", href: "/admin/ipcr-periods", icon: CalendarDays, roles: ["super_admin"] },
      { title: "Audit Trail", href: "/admin/audit-log", icon: Shield, roles: ["super_admin"] },
      { title: "Settings", href: "/admin/settings", icon: Settings, roles: ["super_admin"] },
    ],
  },
];

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  ocm_admin: "OCM Admin",
  hr_admin: "HR Admin",
  hr_record_manager: "HR Record Manager",
  department_head: "Dept Head",
  department_admin: "Dept Admin",
  department_admin_and_department_head: "Dept Admin + Head",
  dtr_manager: "DTR Manager",
  cos_manager: "COS Manager",
  jo_manager: "JO Manager",
  event_attendance_officer: "Attendance Checker",
  employee: "Employee",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, loading } = useUser();

  const userRole: UserRole = user?.role ?? "employee";

  const filteredGroups = navGroups
    .filter((group) => group.roles.includes(userRole))
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.roles.includes(userRole) && (item.visible?.(user) ?? true),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="h-14 px-4 justify-center">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Landmark className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
              LGU HRIS
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
              Human Resources
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <div className="h-px bg-sidebar-border" />

      <SidebarContent className="px-1 pt-2">
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    // The "/" boundary matters: a bare startsWith would light
                    // up "Attendance & DTR" (/attendance) while viewing
                    // "Attendance Corrections" (/attendance-corrections),
                    // which is a different section, not a page under it.
                    (item.href !== "/dashboard" &&
                      item.href !== "/leaves" &&
                      item.href !== "/cto" &&
                      item.href !== "/job-orders" &&
                      pathname.startsWith(`${item.href}/`)) ||
                    (item.href === "/leaves" && (pathname === "/leaves" || (pathname.startsWith("/leaves/") && !pathname.startsWith("/leaves/credits")))) ||
                    (item.href === "/cto" && (pathname === "/cto" || (pathname.startsWith("/cto/") && !pathname.startsWith("/cto/credits")))) ||
                    // "/job-orders/areas", "/job-orders/payroll" and
                    // "/job-orders/memos" are sibling sections, not detail
                    // pages under "/job-orders" — without this they would also
                    // highlight "Job Order Employees" while viewing "Area
                    // Assignments", "Payroll" or "Memorandum", the same class
                    // of bug fixed above for /leaves and /cto.
                    (item.href === "/job-orders" && (pathname === "/job-orders" || (pathname.startsWith("/job-orders/") && !pathname.startsWith("/job-orders/areas") && !pathname.startsWith("/job-orders/payroll") && !pathname.startsWith("/job-orders/memos"))));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="mx-1 h-px bg-sidebar-border" />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar size="sm">
                  <AvatarImage src={user?.avatarUrl ?? ""} alt={user?.fullName ?? ""} />
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-bold">
                    {loading ? "..." : getInitials(user?.fullName ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-xs font-semibold text-sidebar-foreground">
                    {loading ? "Loading..." : user?.fullName ?? "User"}
                  </span>
                  <span className="truncate text-[10px] text-sidebar-foreground/50">
                    {loading ? "" : user?.email ?? ""}
                  </span>
                </div>
                <ChevronUp className="ml-auto h-4 w-4 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="end"
                sideOffset={8}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  <Avatar size="sm">
                    <AvatarImage src={user?.avatarUrl ?? ""} alt={user?.fullName ?? ""} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                      {getInitials(user?.fullName ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {user?.fullName ?? "User"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Shield className="h-4 w-4" />
                  <span>Role:</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {roleLabels[userRole]}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut()}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}
