"use client";

import { DataTable } from "@/components/tables/data-table";
import { plantillaColumns } from "@/components/tables/columns/plantilla-columns";
import { ExportCsvButton } from "@/components/tables/export-csv-button";
import type { PlantillaListRow } from "@/lib/actions/plantilla-actions";

interface PlantillaTableProps {
  data: PlantillaListRow[];
  orgUnitOptions: { label: string; value: string }[];
}

export function PlantillaTable({ data, orgUnitOptions }: PlantillaTableProps) {
  return (
    <DataTable
      fillHeight
      columns={plantillaColumns}
      data={data}
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
      toolbar={(table) => (
        <ExportCsvButton
          key="export-plantilla"
          data={table.getFilteredRowModel().rows.map((r) => r.original)}
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
      )}
    />
  );
}
