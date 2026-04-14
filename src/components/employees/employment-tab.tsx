import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

const employmentTypeLabels: Record<string, string> = {
  plantilla: "Plantilla",
  jo: "Job Order",
  cos: "Contract of Service",
};

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value?: string | null;
  badge?: { text: string; variant?: "default" | "secondary" | "outline" };
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="col-span-2 text-sm font-medium">
        {badge ? (
          <Badge variant={badge.variant ?? "default"}>{badge.text}</Badge>
        ) : (
          value || "—"
        )}
      </span>
    </div>
  );
}

export function EmploymentTab({
  employee,
}: {
  employee: EmployeeWithRelations;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employment Details</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <InfoRow label="Employee No" value={employee.employee_no} />
          <InfoRow
            label="Employment Type"
            badge={{
              text:
                employmentTypeLabels[employee.employment_type] ??
                employee.employment_type,
            }}
          />
          <InfoRow
            label="Status"
            badge={{
              text:
                employee.status.charAt(0).toUpperCase() +
                employee.status.slice(1),
              variant:
                employee.status === "active" ? "secondary" : "destructive",
            }}
          />
          <InfoRow
            label="Hire Date"
            value={format(new Date(employee.hire_date), "MMMM d, yyyy")}
          />
          {employee.end_of_contract && (
            <InfoRow
              label="End of Contract"
              value={format(
                new Date(employee.end_of_contract),
                "MMMM d, yyyy"
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Position & Compensation</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <InfoRow
            label="Department"
            value={
              employee.departments
                ? `${employee.departments.code} — ${employee.departments.name}`
                : null
            }
          />
          <InfoRow
            label="Position"
            value={employee.positions?.title ?? null}
          />
          {employee.positions?.item_number && (
            <InfoRow
              label="Item Number"
              value={employee.positions.item_number}
            />
          )}
          <InfoRow
            label="Salary Grade"
            value={String(employee.salary_grade)}
          />
          <InfoRow
            label="Step Increment"
            value={String(employee.step_increment)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
