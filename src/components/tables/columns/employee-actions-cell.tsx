"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deactivateEmployee,
  reactivateEmployee,
} from "@/lib/actions/employee-actions";
import { useUser } from "@/hooks/use-user";
import type { EmployeeRow } from "./employee-columns";

export function EmployeeActionsCell({ employee }: { employee: EmployeeRow }) {
  const router = useRouter();
  const { user } = useUser();
  const canEdit =
    !!user && ["super_admin", "hr_admin"].includes(user.role);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [loading, setLoading] = useState(false);

  const fullName = [employee.first_name, employee.last_name]
    .filter(Boolean)
    .join(" ");

  const handleDeactivate = async () => {
    setLoading(true);
    const result = await deactivateEmployee(employee.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${fullName} has been deactivated.`);
    }

    setLoading(false);
    setShowDeactivate(false);
    router.refresh();
  };

  const handleReactivate = async () => {
    setLoading(true);
    const result = await reactivateEmployee(employee.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${fullName} has been reactivated.`);
    }

    setLoading(false);
    setShowReactivate(false);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/employees/${employee.id}`)}
          >
            <Eye className="h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => router.push(`/employees/${employee.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {canEdit && employee.status === "active" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDeactivate(true)}
              >
                <UserX className="h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            </>
          )}
          {canEdit && employee.status !== "active" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowReactivate(true)}>
                <UserCheck className="h-4 w-4" />
                Reactivate
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeactivate} onOpenChange={setShowDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{" "}
              <strong>{fullName}</strong>? This will
              mark them as inactive in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={loading}
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {loading ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReactivate} onOpenChange={setShowReactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Reactivate <strong>{fullName}</strong>? Their status will be set
              back to active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              disabled={loading}
            >
              {loading ? "Reactivating..." : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
