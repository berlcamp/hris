"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteCosEmployee } from "@/lib/actions/cos-employee-actions";

interface CosEmployeeDeleteDialogProps {
  employeeId: string;
  employeeName: string;
  /**
   * Row-action menus open this dialog from a DropdownMenuItem, which closes
   * on click before an AlertDialogTrigger nested inside it would ever fire.
   * When `open`/`onOpenChange` are supplied, the caller owns its own trigger
   * (e.g. CosEmployeeActionsCell's DropdownMenuItem) and drives visibility
   * directly, so the built-in destructive Button trigger below is skipped.
   * The profile page keeps using the uncontrolled default (no props passed).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CosEmployeeDeleteDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: CosEmployeeDeleteDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const controlled = open !== undefined;

  const onConfirm = async () => {
    setLoading(true);
    const result = await deleteCosEmployee(employeeId);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("COS employee deleted");
    router.push("/cos/employees");
    router.refresh();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {!controlled && (
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="h-4 w-4" />
          Delete
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {employeeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            The record is archived, not erased — its contract history is kept
            and the COS number becomes available for reuse. Only a Super Admin
            can do this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
