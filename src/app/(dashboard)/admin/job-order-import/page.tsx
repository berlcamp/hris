import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { JobOrderImportClient } from "@/components/admin/job-order-import-client";

export default async function JobOrderImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Order CSV import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-shot migration of the legacy Job Order roster and area assignments.
        </p>
      </div>
      <JobOrderImportClient />
    </div>
  );
}
