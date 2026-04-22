import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getAllPlantilla } from "@/lib/actions/plantilla-actions";
import { DataTable } from "@/components/tables/data-table";
import { plantillaColumns } from "@/components/tables/columns/plantilla-columns";
import { ExportCsvButton } from "@/components/tables/export-csv-button";

export default async function PlantillaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const records = await getAllPlantilla();

  const orgUnits = [...new Set(records.map((r) => r.organizational_unit).filter(Boolean))] as string[];
  const orgUnitOptions = orgUnits.sort().map((u) => ({ label: u, value: u }));

  const total = records.length;
  const filled = records.filter((r) => !r.is_vacant).length;
  const vacant = records.filter((r) => r.is_vacant).length;
  const unfunded = records.filter((r) => !r.is_funded).length;

  return (
    <div className="flex flex-col gap-6 h-[calc(100svh-6.5rem)] overflow-hidden">
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plantilla</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Official plantilla roster including vacant and unfunded positions.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
        {[
          { label: "Total Items", value: total },
          { label: "Filled", value: filled },
          { label: "Vacant", value: vacant },
          { label: "Unfunded", value: unfunded },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border bg-card px-4 py-3 space-y-0.5"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <DataTable
        fillHeight
        columns={plantillaColumns}
        data={records}
        searchableColumns={[
          { id: "incumbent", title: "name" },
          { id: "position_title", title: "position" },
          { id: "item_number", title: "item number" },
        ]}
        filterableColumns={[
          {
            id: "organizational_unit",
            title: "Unit",
            options: orgUnitOptions,
          },
          {
            id: "is_vacant",
            title: "Vacancy",
            options: [
              { label: "Filled", value: "filled" },
              { label: "Vacant", value: "vacant" },
            ],
          },
          {
            id: "is_funded",
            title: "Funded",
            options: [
              { label: "Funded", value: "funded" },
              { label: "Unfunded", value: "unfunded" },
            ],
          },
        ]}
        toolbar={
          <ExportCsvButton
            key="export-plantilla"
            data={records}
            filename="plantilla"
            columns={[
              { key: "item_number", header: "Item Number" },
              { key: "position_title", header: "Position Title" },
              { key: "organizational_unit", header: "Organizational Unit" },
              { key: "salary_grade", header: "Salary Grade" },
              { key: "step", header: "Step" },
              { key: "date_of_original_appointment", header: "Date of Original Appointment" },
              { key: "date_of_last_promotion_appointment", header: "Date of Last Promotion" },
              { key: "status", header: "Status" },
              { key: "is_vacant", header: "Vacant" },
              { key: "is_funded", header: "Funded" },
              { key: "civil_service_eligibility", header: "CS Eligibility" },
            ]}
          />
        }
      />
    </div>
  );
}
