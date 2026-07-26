"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CosEmployeeDeleteDialog } from "@/components/cos/cos-employee-delete-dialog";
import { formatCosEmployeeName } from "@/lib/cos-constants";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";

export function CosEmployeeActionsCell({
  employee,
  canDelete,
}: {
  employee: CosEmployeeWithDepartment;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/cos/employees/${employee.id}`)}
          >
            <Eye className="h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/cos/employees/${employee.id}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canDelete && (
        <CosEmployeeDeleteDialog
          employeeId={employee.id}
          employeeName={formatCosEmployeeName(employee)}
          open={showDelete}
          onOpenChange={setShowDelete}
        />
      )}
    </>
  );
}
