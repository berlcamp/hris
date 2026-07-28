import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCosTemplates } from "@/lib/auth-helpers";
import { CosTemplateForm } from "@/components/cos/cos-template-form";

export default async function NewCosTemplatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCosTemplates(user.role)) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">New Contract Template</h1>
      <CosTemplateForm mode="create" />
    </div>
  );
}
