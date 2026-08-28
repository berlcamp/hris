import Image from "next/image";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { getServerUser } from "@/lib/auth";

/**
 * The signed-in shell: sidebar, header, every HRIS module.
 *
 * An Attendance Checker never sees it. That account exists to work a door on a
 * phone and has its own app at /scan — a card grid and a scanner, and nothing
 * else. Bouncing here rather than in src/proxy.ts keeps the role lookup off
 * every request in the application; this layout is the one thing every
 * dashboard route already has in common.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (user?.role === "event_attendance_officer") redirect("/scan");

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-sm px-6">
          <SidebarTrigger className="-ml-2" />
          <div className="mx-2 h-4 w-px bg-border" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto hidden lg:flex items-center gap-3">
            <Image src="/logo1.png" alt="Logo 1" width={40} height={40} className="h-10 w-auto" />
            <Image src="/logo2.png" alt="Logo 2" width={40} height={40} className="h-10 w-auto" />
            <Image src="/logo3.png" alt="Logo 3" width={40} height={40} className="h-10 w-auto" />
            <Image src="/logo4.png" alt="Logo 4" width={40} height={40} className="h-10 w-auto" />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
