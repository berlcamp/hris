import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import {
  getCosContract,
  type CosContractWithEmployee,
} from "@/lib/actions/cos-contract-actions";
import { getCosEmployees } from "@/lib/actions/cos-employee-actions";
import { getCosContractTemplates } from "@/lib/actions/cos-contract-template-actions";
import {
  CosContractForm,
  type ContractFormEmployee,
} from "@/components/cos/cos-contract-form";
import { asFormBody } from "@/lib/cos-contract-doc";
import type { CosContractFormValues } from "@/lib/validations/cos-contract-schema";

export default async function NewCosContractPage({
  searchParams,
}: {
  searchParams: Promise<{
    employee?: string;
    duplicate?: string;
    renew?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const {
    employee: employeeParam,
    duplicate,
    renew,
  } = await searchParams;

  const [allEmployees, allTemplates] = await Promise.all([
    getCosEmployees(),
    getCosContractTemplates(),
  ]);

  // Only an active employee can receive a new contract — see
  // assertEmployeeActive in cos-contract-actions.ts, which the server action
  // also enforces; filtering here just keeps the picker honest.
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

  const templates = allTemplates
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, name: t.name }));

  // `renew` wins over `duplicate` when both are present (query-parameter
  // contract documented in cos-contract-form.tsx / task-9-brief.md).
  let mode: "create" | "renew" = "create";
  let contract: CosContractWithEmployee | undefined;
  let defaults: Partial<CosContractFormValues> | undefined;

  if (renew) {
    const source = await getCosContract(renew);
    if (!source) notFound();
    // A terminated contract can never be renewed — see the `source.status
    // === "terminated"` guard in renewCosContract (cos-contract-actions.ts),
    // which is the actual authority. The Renew link on [id]/page.tsx and the
    // timeline are already hidden once a contract reads as terminated, so
    // this only matters for a stale link or a typed-in `?renew=<id>` URL;
    // failing here (not just at submit) avoids showing a form for an action
    // that can never succeed.
    if (source.status === "terminated") notFound();
    mode = "renew";
    contract = source;
    // The employee is locked in renew mode (see cos-contract-form.tsx,
    // `employeeLocked`), but `employees` above is filtered to active-only.
    // The Renew link on [id]/page.tsx is hidden once the employee has gone
    // inactive, but that is a UX gate, not the authority — someone can still
    // reach this URL directly (a stale link, a typed-in id). Without this,
    // the locked Select would have a value matching nothing in its own
    // `items` and render blank with no indication of who the renewal is for.
    // Same fallback as [id]/edit/page.tsx.
    if (
      !employees.some((e) => e.id === source.cos_employee_id) &&
      source.cos_employees
    ) {
      employees.push({
        id: source.cos_employees.id,
        cos_no: source.cos_employees.cos_no,
        first_name: source.cos_employees.first_name,
        middle_name: source.cos_employees.middle_name,
        last_name: source.cos_employees.last_name,
        suffix: source.cos_employees.suffix,
        position_title: source.position_title,
        monthly_rate: source.monthly_rate,
      });
    }
  } else if (duplicate) {
    const source = await getCosContract(duplicate);
    if (!source) notFound();
    defaults = {
      // An explicit ?employee= takes precedence; otherwise a duplicate
      // defaults to reissuing for the same employee the source contract was
      // for. Either way this is a fresh contract — renewed_from_id stays
      // null, and the period is never copied (see cos-contract-form.tsx).
      cos_employee_id: employeeParam ?? source.cos_employee_id,
      monthly_rate: source.monthly_rate,
      position_title: source.position_title,
      scope_of_work: source.scope_of_work,
      signatory_name: source.signatory_name,
      signatory_position: source.signatory_position,
      witness_name: source.witness_name,
      witness_position: source.witness_position,
      // source.body is TiptapNode; defaults.body must be the form's
      // narrower "doc"-literal type — see asFormBody in cos-contract-doc.ts.
      body: asFormBody(source.body),
    };
  } else if (employeeParam) {
    defaults = { cos_employee_id: employeeParam };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "renew" ? "Renew Contract" : "New Contract"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "renew"
            ? "The new contract is linked back to the one it renews and must start after that contract's effective end."
            : "Issue a Contract of Service to an active COS employee."}
        </p>
      </div>
      <CosContractForm
        mode={mode}
        employees={employees}
        templates={templates}
        contract={contract}
        defaults={defaults}
      />
    </div>
  );
}
