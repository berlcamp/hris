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
import { useUser } from "@/hooks/use-user";
import { signOut } from "@/lib/actions/auth-actions";
import type { UserRole } from "@/lib/types";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

interface NavGroup {
  label: string;
  roles: UserRole[];
  items: NavItem[];
}

const allRoles: UserRole[] = ["super_admin", "hr_admin", "department_head", "employee"];
const adminRoles: UserRole[] = ["super_admin", "hr_admin"];

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
    roles: ["super_admin", "hr_admin", "department_head"],
    items: [
      { title: "Employees", href: "/employees", icon: Users, roles: ["super_admin", "hr_admin", "department_head"] },
      { title: "NOSI", href: "/nosi", icon: TrendingUp, roles: adminRoles },
      { title: "NOSA", href: "/nosa", icon: FileText, roles: adminRoles },
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
    roles: allRoles,
    items: [
      { title: "Leave Management", href: "/leaves", icon: CalendarDays, roles: allRoles },
      { title: "Leave Credits", href: "/leaves/credits", icon: CreditCard, roles: adminRoles },
      { title: "Attendance & DTR", href: "/attendance", icon: Clock, roles: allRoles },
    ],
  },
  {
    label: "Performance",
    roles: ["super_admin", "hr_admin", "department_head", "employee"],
    items: [
      { title: "IPCR", href: "/performance", icon: ClipboardList, roles: allRoles },
    ],
  },
  {
    label: "Reports",
    roles: adminRoles,
    items: [
      { title: "Reports", href: "/reports", icon: BarChart3, roles: adminRoles },
      { title: "Leave Ledger", href: "/reports/leave-ledger", icon: FileText, roles: adminRoles },
    ],
  },
  {
    label: "Administration",
    roles: ["super_admin", "hr_admin"],
    items: [
      { title: "User Management", href: "/admin/users", icon: UserPlus, roles: ["super_admin"] },
      { title: "Salary Grades", href: "/admin/salary-grades", icon: Building2, roles: ["super_admin"] },
      { title: "IPCR Periods", href: "/admin/ipcr-periods", icon: CalendarDays, roles: ["super_admin", "hr_admin"] },
      { title: "Audit Trail", href: "/admin/audit-log", icon: Shield, roles: ["super_admin"] },
      { title: "Settings", href: "/admin/settings", icon: Settings, roles: ["super_admin"] },
    ],
  },
];

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  hr_admin: "HR Admin",
  department_head: "Dept Head",
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
      items: group.items.filter((item) => item.roles.includes(userRole)),
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
                    (item.href !== "/dashboard" &&
                      item.href !== "/leaves" &&
                      pathname.startsWith(item.href)) ||
                    (item.href === "/leaves" && (pathname === "/leaves" || (pathname.startsWith("/leaves/") && !pathname.startsWith("/leaves/credits"))));
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
