import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getCosPayrolls } from "@/lib/actions/cos-payroll-actions";
import { CosPayrollListClient } from "@/components/cos-payroll/cos-payroll-list-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function CosPayrollPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const periodFrom = sp.from || null;
  const periodTo = sp.to || null;

  const { rows, totalCount } = await getCosPayrolls({
    page,
    pageSize: 10,
    periodFrom,
    periodTo,
  });

  return (
    <CosPayrollListClient
      initialRows={rows}
      initialTotalCount={totalCount}
      initialPage={page}
      initialFrom={periodFrom ?? ""}
      initialTo={periodTo ?? ""}
      isSuperAdmin={user.role === "super_admin"}
    />
  );
}
