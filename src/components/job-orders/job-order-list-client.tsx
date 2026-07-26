"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { DataTable } from "@/components/tables/data-table";
import { jobOrderColumns } from "@/components/tables/columns/job-order-columns";
import { JobOrderForm } from "@/components/job-orders/job-order-form";
import { deleteJobOrderEmployee } from "@/lib/actions/job-order-actions";
import type { JobOrderArea, JobOrderEmployee } from "@/lib/types";

interface JobOrderListClientProps {
  initialEmployees: JobOrderEmployee[];
  areas: JobOrderArea[];
}

export function JobOrderListClient({
  initialEmployees,
  areas,
}: JobOrderListClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<JobOrderEmployee | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JobOrderEmployee | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const dialogOpen = creating || editing !== null;

  const handleClose = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSuccess = () => {
    handleClose();
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderEmployee(deleteTarget.id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Job Order employee deleted.");
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const columns = jobOrderColumns({
    onEdit: setEditing,
    onDelete: setDeleteTarget,
  });

  const areaOptions = areas.map((a) => ({ label: a.name, value: a.id }));

  return (
    <>
      <DataTable
        columns={columns}
        data={initialEmployees}
        searchableColumns={[{ id: "full_name", title: "name" }]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ],
          },
          {
            id: "area",
            title: "Area",
            options: areaOptions,
          },
          {
            id: "has_atm",
            title: "ATM",
            options: [
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New Employee
          </Button>
        }
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Job Order Employee" : "New Job Order Employee"}
            </DialogTitle>
            <DialogDescription>
              Personal, employment, bank, and community tax details for this
              Job Order employee.
            </DialogDescription>
          </DialogHeader>
          <JobOrderForm
            areas={areas}
            mode={editing ? "edit" : "create"}
            defaultValues={
              editing
                ? {
                    id: editing.id,
                    full_name: editing.full_name,
                    sex: editing.sex,
                    purok: editing.purok ?? "",
                    barangay: editing.barangay ?? "",
                    area_id: editing.area_id,
                    sub_area: editing.sub_area ?? "",
                    daily_rate: editing.daily_rate,
                    working_hours: editing.working_hours,
                    date_started: editing.date_started ?? "",
                    eligibility: editing.eligibility ?? "",
                    recommended_by: editing.recommended_by ?? "",
                    remarks: editing.remarks ?? "",
                    remarks_2: editing.remarks_2 ?? "",
                    has_atm: editing.has_atm,
                    landbank_account_number:
                      editing.landbank_account_number ?? "",
                    sss_no: editing.sss_no ?? "",
                    sss_ss: editing.sss_ss,
                    sss_ec: editing.sss_ec,
                    community_tax_number: editing.community_tax_number ?? "",
                    community_tax_date: editing.community_tax_date ?? "",
                    community_tax_place_issued:
                      editing.community_tax_place_issued ?? "",
                    status: editing.status,
                  }
                : undefined
            }
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job Order Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.full_name}
              &quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
