import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getVacantPlantillaItems } from "@/lib/actions/rsp-actions";
import { VacancyForm } from "@/components/rsp/vacancy-form";

export default async function NewVacancyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const plantillaItems = await getVacantPlantillaItems();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Vacancy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prepare a vacant plantilla item for publication. The vacancy is
          created as a draft — publish it once the posting dates are set.
        </p>
      </div>
      <VacancyForm plantillaItems={plantillaItems} />
    </div>
  );
}
