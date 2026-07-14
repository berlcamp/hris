import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { rspApplicantColumns } from "@/components/tables/columns/rsp-applicant-columns";
import { ApplicantFormDialog } from "@/components/rsp/applicant-form-dialog";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getApplicants } from "@/lib/actions/rsp-actions";

export default async function RspApplicantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const applicants = await getApplicants();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/rsp"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to vacancies
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Applicants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Directory of applicants encoded by HR. One record per person,
            reusable across vacancies.
          </p>
        </div>
        <ApplicantFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Add Applicant
            </Button>
          }
        />
      </div>

      <DataTable
        columns={rspApplicantColumns}
        data={applicants}
        searchableColumns={[{ id: "name", title: "name" }]}
      />
    </div>
  );
}
