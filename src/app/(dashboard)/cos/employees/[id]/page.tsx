import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CosEmployeeDeleteDialog } from "@/components/cos/cos-employee-delete-dialog";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployee } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUS_LABELS,
  COS_EMPLOYEE_STATUS_VARIANT,
  COS_SEX_LABELS,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export default async function CosEmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const employee = await getCosEmployee(id);
  if (!employee) notFound();

  const name = formatCosEmployeeName(employee);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant={COS_EMPLOYEE_STATUS_VARIANT[employee.status]}>
              {COS_EMPLOYEE_STATUS_LABELS[employee.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            COS No. {employee.cos_no}
            {employee.departments ? ` · ${employee.departments.name}` : ""}
            {employee.position_title ? ` · ${employee.position_title}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cos/employees/${employee.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          {user.role === "super_admin" ? (
            <CosEmployeeDeleteDialog
              employeeId={employee.id}
              employeeName={name}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sex"
              value={employee.sex ? COS_SEX_LABELS[employee.sex] : null}
            />
            <Field
              label="Birthdate"
              value={
                employee.birth_date
                  ? format(
                      new Date(`${employee.birth_date}T00:00:00`),
                      "MMM d, yyyy",
                    )
                  : null
              }
            />
            <Field label="Contact Number" value={employee.contact_number} />
            <Field label="Email Address" value={employee.email} />
            <div className="sm:col-span-2">
              <Field label="Address" value={employee.address} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Office / Department"
              value={employee.departments?.name ?? null}
            />
            <Field label="Position" value={employee.position_title} />
            <Field label="Eligibility" value={employee.eligibility} />
            <Field label="Recommended By" value={employee.recommended_by} />
            <div className="sm:col-span-2">
              <Field label="Remarks" value={employee.remarks} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* COS-3 replaces this card's body with the contract timeline. The
          heading and its position on the page are fixed here so that lands as
          a drop-in. */}
      <Card>
        <CardHeader>
          <CardTitle>Contract History</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Contract management arrives with the Contracts module.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
