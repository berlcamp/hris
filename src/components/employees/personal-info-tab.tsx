import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="col-span-2 text-sm font-medium">
        {value || "—"}
      </span>
    </div>
  );
}

export function PersonalInfoTab({
  employee,
}: {
  employee: EmployeeWithRelations;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <InfoRow label="First Name" value={employee.first_name} />
          <InfoRow label="Middle Name" value={employee.middle_name} />
          <InfoRow label="Last Name" value={employee.last_name} />
          <InfoRow label="Suffix" value={employee.suffix} />
          <InfoRow
            label="Birth Date"
            value={
              employee.birth_date
                ? format(new Date(employee.birth_date), "MMMM d, yyyy")
                : null
            }
          />
          <InfoRow label="Gender" value={employee.gender} />
          <InfoRow label="Civil Status" value={employee.civil_status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <InfoRow label="Phone" value={employee.phone} />
          <InfoRow label="Address" value={employee.address} />
        </CardContent>
      </Card>
    </div>
  );
}
