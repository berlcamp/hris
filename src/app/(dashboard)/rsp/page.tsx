import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { rspVacancyColumns } from "@/components/tables/columns/rsp-vacancy-columns";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getVacancies } from "@/lib/actions/rsp-actions";
import {
  VACANCY_STATUSES,
  VACANCY_STATUS_LABELS,
  isVacancyExpired,
} from "@/lib/rsp-constants";

export default async function RspPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const vacancies = await getVacancies();

  const published = vacancies.filter((v) => v.status === "published").length;
  const closed = vacancies.filter((v) => v.status === "closed").length;
  const filled = vacancies.filter((v) => v.status === "filled").length;
  const expired = vacancies.filter((v) => isVacancyExpired(v)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Recruitment, Selection &amp; Placement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Publication of vacant positions, HRMPSB comparative assessment, and
            appointments per CSC ORAOHRA and RA 7041.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/rsp/applicants">
            <Button variant="outline">
              <Users className="h-4 w-4" />
              Applicants
            </Button>
          </Link>
          <Link href="/rsp/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Vacancy
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Total Vacancies", value: vacancies.length },
          { label: "Published", value: published },
          { label: "Closed", value: closed },
          { label: "Filled", value: filled },
          { label: "Expired Publication", value: expired },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border bg-card px-4 py-3 space-y-0.5"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={rspVacancyColumns}
        data={vacancies}
        searchableColumns={[{ id: "position_title", title: "position" }]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: VACANCY_STATUSES.map((s) => ({
              label: VACANCY_STATUS_LABELS[s],
              value: s,
            })),
          },
        ]}
      />
    </div>
  );
}
