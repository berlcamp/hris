import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosContracts } from "@/lib/actions/cos-contract-actions";
import { CosContractListClient } from "@/components/cos/cos-contract-list-client";

export default async function CosContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.roles)) redirect("/dashboard");

  const contracts = await getCosContracts();

  // Filter options are department NAMES because that is what the column's
  // accessorFn returns and what the faceted filter compares against.
  const departmentOptions = Array.from(
    new Set(
      contracts
        .map((c) => c.cos_employees?.departments?.name)
        .filter((n): n is string => !!n),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">COS Contracts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every Contract of Service issued, including terminated and expired
          ones. Renewals appear as their own row, linked back to the contract
          they extend.
        </p>
      </div>
      <CosContractListClient
        contracts={contracts}
        departmentOptions={departmentOptions}
        canCreate={canManageCos(user.roles)}
      />
    </div>
  );
}
