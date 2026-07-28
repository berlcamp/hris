import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { Pencil, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CosContractPdfButton } from "@/components/cos/cos-contract-pdf-button";
import { CosContractTerminateDialog } from "@/components/cos/cos-contract-terminate-dialog";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import {
  getCosContract,
  getContractsForEmployee,
} from "@/lib/actions/cos-contract-actions";
import {
  COS_CONTRACT_STATUS_LABELS,
  COS_CONTRACT_STATUS_VARIANT,
  deriveCosContractStatus,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

function formatDay(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
}

function formatPHP(n: number): string {
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm whitespace-pre-line">
        {value?.trim() ? value : "—"}
      </p>
    </div>
  );
}

export default async function CosContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const contract = await getCosContract(id);
  if (!contract) notFound();

  const employee = contract.cos_employees;
  const derivedStatus = deriveCosContractStatus(contract);

  // A contract that has already been renewed must not be renewed again — the
  // chain moves forward from its successor instead.
  const employeeContracts = await getContractsForEmployee(
    contract.cos_employee_id,
  );
  const hasSuccessor = employeeContracts.some(
    (c) => c.renewed_from_id === contract.id,
  );
  const source = contract.renewed_from_id
    ? employeeContracts.find((c) => c.id === contract.renewed_from_id)
    : undefined;

  // Hidden (not just disabled) once the employee has gone inactive: renewing
  // always fails server-side (assertEmployeeActive in cos-contract-actions.ts
  // — the actual authority, unchanged by this check), so offering the link
  // would just walk the user to a dead end. The renew page itself still
  // defends against a stale/typed-in link independently of this gate — see
  // the fallback in cos/contracts/new/page.tsx's `renew` branch.
  const canRenew =
    contract.status !== "terminated" &&
    !hasSuccessor &&
    employee?.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {employee ? formatCosEmployeeName(employee) : "Unknown employee"}
            </h1>
            <Badge variant={COS_CONTRACT_STATUS_VARIANT[derivedStatus]}>
              {COS_CONTRACT_STATUS_LABELS[derivedStatus]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {employee ? `COS No. ${employee.cos_no}` : null}
            {employee?.departments ? ` · ${employee.departments.name}` : ""}
            {contract.position_title ? ` · ${contract.position_title}` : ""}
          </p>
          {source ? (
            <p className="text-sm text-muted-foreground mt-1">
              Renewed from{" "}
              <Link
                href={`/cos/contracts/${source.id}`}
                className="text-primary hover:underline"
              >
                the contract covering {formatDay(source.period_start)} –{" "}
                {formatDay(source.period_end)}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CosContractPdfButton contract={contract} />
          <Link href={`/cos/contracts/${contract.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          {canRenew ? (
            <Link href={`/cos/contracts/new?renew=${contract.id}`}>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Renew
              </Button>
            </Link>
          ) : null}
          {contract.status !== "terminated" ? (
            <CosContractTerminateDialog
              contractId={contract.id}
              periodStart={contract.period_start}
              periodEnd={contract.period_end}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Period"
              value={`${formatDay(contract.period_start)} – ${formatDay(
                contract.period_end,
              )}`}
            />
            <Field
              label="Monthly Rate"
              value={
                contract.monthly_rate === null
                  ? null
                  : formatPHP(contract.monthly_rate)
              }
            />
            <Field label="Position" value={contract.position_title} />
            <div className="sm:col-span-2">
              <Field label="Scope of Work" value={contract.scope_of_work} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signatories</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Signatory Name" value={contract.signatory_name} />
            <Field
              label="Signatory Position"
              value={contract.signatory_position}
            />
            <Field label="Witness Name" value={contract.witness_name} />
            <Field
              label="Witness Position"
              value={contract.witness_position}
            />
          </CardContent>
        </Card>

        {contract.status === "terminated" ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Termination</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Termination Date"
                value={
                  contract.terminated_on
                    ? formatDay(contract.terminated_on)
                    : null
                }
              />
              <div className="sm:col-span-2">
                <Field
                  label="Reason"
                  value={contract.termination_reason}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
