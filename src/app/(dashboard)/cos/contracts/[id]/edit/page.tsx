import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosContract } from "@/lib/actions/cos-contract-actions";
import { getCosEmployees } from "@/lib/actions/cos-employee-actions";
import { getCosContractTemplates } from "@/lib/actions/cos-contract-template-actions";
import {
  CosContractForm,
  type ContractFormEmployee,
} from "@/components/cos/cos-contract-form";
import { formatCosEmployeeName } from "@/lib/cos-constants";

export default async function EditCosContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.roles)) redirect("/dashboard");

  const [contract, allEmployees, allTemplates] = await Promise.all([
    getCosContract(id),
    getCosEmployees(),
    getCosContractTemplates(),
  ]);
  if (!contract) notFound();

  // The employee is fixed once a contract exists (see cos-contract-form.tsx,
  // `employeeLocked`) and the select is disabled in edit mode, but the picker
  // still needs an option matching the current value — getCosEmployees()
  // excludes inactive/soft-deleted rows, so the contract's own employee is
  // added back in when the active-only filter would otherwise have dropped it.
  const employees: ContractFormEmployee[] = allEmployees
    .filter((e) => e.status === "active")
    .map((e) => ({
      id: e.id,
      cos_no: e.cos_no,
      first_name: e.first_name,
      middle_name: e.middle_name,
      last_name: e.last_name,
      suffix: e.suffix,
      position_title: e.position_title,
      monthly_rate: e.monthly_rate,
    }));
  if (
    !employees.some((e) => e.id === contract.cos_employee_id) &&
    contract.cos_employees
  ) {
    employees.push({
      id: contract.cos_employees.id,
      cos_no: contract.cos_employees.cos_no,
      first_name: contract.cos_employees.first_name,
      middle_name: contract.cos_employees.middle_name,
      last_name: contract.cos_employees.last_name,
      suffix: contract.cos_employees.suffix,
      position_title: contract.position_title,
      monthly_rate: contract.monthly_rate,
    });
  }

  const templates = allTemplates
    .filter((t) => t.is_active || t.id === contract.template_id)
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit Contract
          {contract.cos_employees
            ? ` — ${formatCosEmployeeName(contract.cos_employees)}`
            : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          COS No. {contract.cos_employees?.cos_no ?? "—"}
        </p>
      </div>
      <CosContractForm
        mode="edit"
        employees={employees}
        templates={templates}
        contract={contract}
      />
    </div>
  );
}
