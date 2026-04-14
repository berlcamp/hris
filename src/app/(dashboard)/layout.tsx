import Image from "next/image";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
