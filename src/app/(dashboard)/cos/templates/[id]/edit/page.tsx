import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCosTemplates } from "@/lib/auth-helpers";
import { getCosContractTemplate } from "@/lib/actions/cos-contract-template-actions";
import { CosTemplateForm } from "@/components/cos/cos-template-form";

export default async function EditCosTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Params are async in Next 16 — await before destructuring.
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCosTemplates(user.role)) redirect("/dashboard");

  const template = await getCosContractTemplate(id);
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit Template</h1>
      <CosTemplateForm mode="edit" template={template} />
    </div>
  );
}
