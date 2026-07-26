"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { JobOrderArea } from "@/lib/types";

export function jobOrderAreaColumns(handlers: {
  onEdit: (area: JobOrderArea) => void;
  onDelete: (area: JobOrderArea) => void;
}): ColumnDef<JobOrderArea>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => {
        const description = row.getValue("description") as string | null;
        return description ? (
          <span
            className="block max-w-[24rem] truncate text-sm text-muted-foreground"
            title={description}
          >
            {description}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) =>
        row.getValue("is_active") ? (
          <Badge
            variant="outline"
            className="border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
          >
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
          </Badge>
        ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id) ? "active" : "inactive");
      },
    },
    {
      accessorKey: "employee_count",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employees" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.getValue("employee_count")}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handlers.onDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
