"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { PlantillaListRow } from "@/lib/actions/plantilla-actions";

function fmtDate(d: string | null) {
  return d ? format(new Date(d), "MMM d, yyyy") : "—";
}

export const plantillaColumns: ColumnDef<PlantillaListRow>[] = [
  {
    accessorKey: "item_number",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Item No." />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.getValue("item_number") ?? "—"}</span>
    ),
  },
  {
    id: "incumbent",
    accessorFn: (row) => {
      if (row.employees) return `${row.employees.last_name}, ${row.employees.first_name}`;
      if (row.ref_last_name) return `${row.ref_last_name}, ${row.ref_first_name ?? ""}`.trim();
      return "";
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Incumbent" />
    ),
    cell: ({ row }) => {
      const emp = row.original.employees;
      if (emp) {
        return (
          <Link
            href={`/employees/${emp.id}`}
            className="font-medium hover:underline"
          >
            {emp.last_name}, {emp.first_name}
          </Link>
        );
      }
      const name = [row.original.ref_last_name, row.original.ref_first_name]
        .filter(Boolean)
        .join(", ");
      return name ? (
        <span className="text-muted-foreground text-sm">{name}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "position_title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
    cell: ({ row }) => (
      <span>{row.getValue("position_title") ?? "—"}</span>
    ),
  },
  {
    id: "organizational_unit",
    accessorKey: "organizational_unit",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Unit" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue("organizational_unit") ?? "—"}</span>
    ),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.original.organizational_unit ?? ""),
  },
  {
    accessorKey: "salary_grade",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SG" />
    ),
    cell: ({ row }) => {
      const sg = row.getValue("salary_grade");
      const step = row.original.step;
      return sg != null ? (
        <span className="font-mono text-sm">
          {String(sg)}{step != null ? `-${step}` : ""}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: "date_of_original_appointment",
    accessorKey: "date_of_original_appointment",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Original Appt." />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {fmtDate(row.getValue("date_of_original_appointment"))}
      </span>
    ),
  },
  {
    id: "date_of_last_promotion_appointment",
    accessorKey: "date_of_last_promotion_appointment",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Promotion" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {fmtDate(row.getValue("date_of_last_promotion_appointment"))}
      </span>
    ),
  },
  {
    id: "is_vacant",
    accessorKey: "is_vacant",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Vacancy" />
    ),
    cell: ({ row }) =>
      row.getValue("is_vacant") ? (
        <Badge variant="outline">Vacant</Badge>
      ) : (
        <Badge variant="secondary">Filled</Badge>
      ),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.original.is_vacant ? "vacant" : "filled"),
  },
  {
    id: "is_funded",
    accessorKey: "is_funded",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Funded" />
    ),
    cell: ({ row }) =>
      row.getValue("is_funded") ? (
        <Badge variant="secondary">Funded</Badge>
      ) : (
        <Badge variant="destructive">Unfunded</Badge>
      ),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.original.is_funded ? "funded" : "unfunded"),
  },
];
