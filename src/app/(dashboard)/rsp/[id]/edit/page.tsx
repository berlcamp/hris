import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getVacancyById } from "@/lib/actions/rsp-actions";
import { VacancyForm } from "@/components/rsp/vacancy-form";

export default async function EditVacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const { id } = await params;

  let vacancy;
  try {
    vacancy = await getVacancyById(id);
  } catch {
    notFound();
  }
  if (!["draft", "published"].includes(vacancy.status)) {
    redirect(`/rsp/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Vacancy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {vacancy.item_number} — {vacancy.position_title}
        </p>
      </div>
      <VacancyForm plantillaItems={[]} vacancy={vacancy} />
    </div>
  );
}
