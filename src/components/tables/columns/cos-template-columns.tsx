"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { CosContractTemplate } from "@/lib/actions/cos-contract-template-actions";

export function cosTemplateColumns(): ColumnDef<CosContractTemplate>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Template" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/cos/templates/${row.original.id}/edit`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "description",
      accessorFn: (row) => row.description ?? "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
    },
    {
      id: "status",
      // The faceted filter compares against the accessor value, so the filter
      // options must be these exact strings.
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
    },
  ];
}
