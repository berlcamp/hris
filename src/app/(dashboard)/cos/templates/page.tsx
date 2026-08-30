import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCosTemplates } from "@/lib/auth-helpers";
import { getCosContractTemplates } from "@/lib/actions/cos-contract-template-actions";
import { CosTemplateListClient } from "@/components/cos/cos-template-list-client";

export default async function CosTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCosTemplates(user.roles)) redirect("/dashboard");

  const templates = await getCosContractTemplates();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Contract Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reusable contract boilerplate. Creating a contract copies the template
          body, so editing a template never changes a contract already issued.
        </p>
      </div>
      <CosTemplateListClient
        templates={templates}
        canCreate={canManageCosTemplates(user.roles)}
      />
    </div>
  );
}
