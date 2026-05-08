import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  getJoPayrolls,
  getJoEmployees,
} from "@/lib/actions/jo-payroll-actions";
import { JoPayrollListClient } from "@/components/jo-payroll/jo-payroll-list-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function JoPayrollPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const periodFrom = sp.from || null;
  const periodTo = sp.to || null;

  const [{ rows, totalCount }, joEmployees] = await Promise.all([
    getJoPayrolls({ page, pageSize: 10, periodFrom, periodTo }),
    getJoEmployees(),
  ]);

  return (
    <JoPayrollListClient
      initialRows={rows}
      initialTotalCount={totalCount}
      initialPage={page}
      initialFrom={periodFrom ?? ""}
      initialTo={periodTo ?? ""}
      isSuperAdmin={user.role === "super_admin"}
      joEmployees={joEmployees}
    />
  );
}
