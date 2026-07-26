"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { jobOrderAreaColumns } from "@/components/tables/columns/job-order-area-columns";
import {
  createJobOrderArea,
  updateJobOrderArea,
  deleteJobOrderArea,
} from "@/lib/actions/job-order-area-actions";
import {
  jobOrderAreaSchema,
  type JobOrderAreaValues,
} from "@/lib/validations/job-order-schema";
import type { JobOrderArea } from "@/lib/types";

interface JobOrderAreaManagerProps {
  initialAreas: JobOrderArea[];
}

export function JobOrderAreaManager({ initialAreas }: JobOrderAreaManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<JobOrderArea | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JobOrderArea | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dialogOpen = creating || editing !== null;

  const handleClose = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSubmit = async (values: JobOrderAreaValues) => {
    setSubmitting(true);
    try {
      const result = editing
        ? await updateJobOrderArea(editing.id, values)
        : await createJobOrderArea(values);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Area updated." : "Area created.");
      handleClose();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderArea(deleteTarget.id);
      if ("error" in result && result.error) {
        // The message names how many employees still block the delete —
        // never swallow it.
        toast.error(result.error);
        return;
      }
      toast.success("Area deleted.");
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const columns = jobOrderAreaColumns({
    onEdit: setEditing,
    onDelete: setDeleteTarget,
  });

  return (
    <>
      <DataTable
        columns={columns}
        data={initialAreas}
        searchableColumns={[{ id: "name", title: "name" }]}
        filterableColumns={[
          {
            id: "is_active",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New Area
          </Button>
        }
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Area" : "New Area"}</DialogTitle>
            <DialogDescription>
              Offices and locations Job Order personnel are assigned to.
            </DialogDescription>
          </DialogHeader>
          <AreaForm
            initial={
              editing
                ? {
                    name: editing.name,
                    description: editing.description ?? "",
                    is_active: editing.is_active,
                  }
                : undefined
            }
            submitting={submitting}
            onSubmit={handleSubmit}
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
            <AlertDialogTitle>Delete Area</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This cannot be undone. Areas with assigned employees cannot be
              deleted.
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

interface AreaFormProps {
  initial?: JobOrderAreaValues;
  submitting: boolean;
  onSubmit: (values: JobOrderAreaValues) => void;
  onCancel: () => void;
}

function AreaForm({ initial, submitting, onSubmit, onCancel }: AreaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobOrderAreaValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobOrderAreaSchema) as any,
    defaultValues: initial ?? { name: "", description: "", is_active: true },
  });

  const isActive = watch("is_active");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="area-name">Name *</Label>
        <Input
          id="area-name"
          placeholder="e.g., City Hall Grounds"
          {...register("name")}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="area-description">Description</Label>
        <Textarea
          id="area-description"
          rows={2}
          placeholder="Optional notes about this area"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Active</p>
          <p className="text-xs text-muted-foreground">
            Inactive areas cannot be assigned to new employees.
          </p>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={(checked) =>
            setValue("is_active", !!checked, { shouldValidate: true })
          }
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Save Changes" : "Create Area"}
        </Button>
      </DialogFooter>
    </form>
  );
}
