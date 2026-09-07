"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, UserMinus, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { CscTeamMember } from "@/lib/actions/csc-team-actions";

/**
 * The value the Team column sorts and filters on. `csc_team` is nullable and a
 * faceted filter has no option for null, so the unassigned share one visible
 * label — which is also the row people come to this page looking for.
 */
export const UNASSIGNED = "Unassigned";

export function cscTeamColumns(handlers: {
  onAssign: (member: CscTeamMember) => void;
  onRemove: (member: CscTeamMember) => void;
}): ColumnDef<CscTeamMember>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("full_name")}</span>
      ),
    },
    {
      accessorKey: "id_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
      cell: ({ row }) => {
        const id = row.getValue("id_number") as string | null;
        return id ? (
          <span className="text-sm">{id}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "employment_label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Registry" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("employment_label")}</Badge>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "group_name",
      header: ({ column }) => (
        // Department for Plantilla and COS, AREA for Job Order — the axis
        // changes per registry (see GROUP_AXIS in src/lib/event-repo.ts), so
        // the heading names both rather than lying about one.
        <DataTableColumnHeader column={column} title="Department / Area" />
      ),
      cell: ({ row }) => {
        const group = row.getValue("group_name") as string | null;
        return group ? (
          <span className="text-sm text-muted-foreground">{group}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "team",
      accessorFn: (row) => row.csc_team ?? UNASSIGNED,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Team" />,
      cell: ({ row }) => {
        const team = row.original.csc_team;
        return team ? (
          <Badge variant="secondary">{team}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">{UNASSIGNED}</span>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
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
            <DropdownMenuItem onClick={() => handlers.onAssign(row.original)}>
              <UsersRound className="h-4 w-4" />
              {row.original.csc_team ? "Change team" : "Assign to team"}
            </DropdownMenuItem>
            {row.original.csc_team && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handlers.onRemove(row.original)}
              >
                <UserMinus className="h-4 w-4" />
                Remove from team
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
