import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getPayrolls } from "@/lib/actions/payroll-actions";
import { PayrollListClient } from "@/components/payroll/payroll-list-client";
import { hasAnyRole, hasRole } from "@/lib/auth-helpers";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasAnyRole(user.roles, "super_admin", "hr_admin")) redirect("/dashboard");

  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const periodFrom = sp.from || null;
  const periodTo = sp.to || null;

  const { rows, totalCount } = await getPayrolls({
    page,
    pageSize: 10,
    periodFrom,
    periodTo,
  });

  return (
    <PayrollListClient
      initialRows={rows}
      initialTotalCount={totalCount}
      initialPage={page}
      initialFrom={periodFrom ?? ""}
      initialTo={periodTo ?? ""}
      isSuperAdmin={hasRole(user.roles, "super_admin")}
    />
  );
}
