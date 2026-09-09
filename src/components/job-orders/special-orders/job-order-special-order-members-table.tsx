"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { JobOrderSpecialOrderAddMemberDialog } from "./job-order-special-order-add-member-dialog";
import {
  removeJobOrderSpecialOrderMember,
  updateJobOrderSpecialOrderMember,
} from "@/lib/actions/job-order-special-order-actions";
import type { JobOrderSpecialOrderMember } from "@/lib/types";

interface JobOrderSpecialOrderMembersTableProps {
  specialOrderId: string;
  members: JobOrderSpecialOrderMember[];
  editable: boolean;
}

export function JobOrderSpecialOrderMembersTable({
  specialOrderId,
  members,
  editable,
}: JobOrderSpecialOrderMembersTableProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] =
    useState<JobOrderSpecialOrderMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = await removeJobOrderSpecialOrderMember(removeTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${removeTarget.full_name} removed.`);
      setRemoveTarget(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong removing this person. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Personnel{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({members.length})
          </span>
        </h2>
        {editable && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add personnel
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No personnel on this special order yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Area assigned</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m, i) => (
                <MemberRow
                  key={m.id}
                  index={i}
                  member={m}
                  editable={editable}
                  onRemove={() => setRemoveTarget(m)}
                  onSaved={() => router.refresh()}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <JobOrderSpecialOrderAddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        specialOrderId={specialOrderId}
        onAdded={() => router.refresh()}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from this special order?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? `Remove ${removeTarget.full_name} from this special order? This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MemberRowProps {
  index: number;
  member: JobOrderSpecialOrderMember;
  editable: boolean;
  onRemove: () => void;
  onSaved: () => void;
}

/**
 * The area assignment is editable because it is a SNAPSHOT taken when the
 * employee was added — correcting it before the order is issued never writes
 * back to hris.job_order_employees.
 */
function MemberRow({
  index,
  member,
  editable,
  onRemove,
  onSaved,
}: MemberRowProps) {
  const [area, setArea] = useState<string>(member.area_assigned ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync local editable state whenever the server-sourced row changes
  // underneath us (router.refresh() after a save), so a stale local value
  // never lingers after a successful commit.
  useEffect(() => {
    setArea(member.area_assigned ?? "");
  }, [member.area_assigned]);

  const commit = async () => {
    const nextArea = area.trim() === "" ? null : area.trim();
    if (nextArea === member.area_assigned) return;
    setSaving(true);
    try {
      const result = await updateJobOrderSpecialOrderMember(member.id, {
        area_assigned: nextArea,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved();
    } catch {
      toast.error("Something went wrong saving this row. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
      <TableCell>
        <div className="font-medium">{member.full_name}</div>
        {member.job_order_employee_id === null && (
          <p className="text-xs italic text-muted-foreground">
            Roster link removed — snapshot preserved
          </p>
        )}
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          value={area}
          disabled={!editable || saving}
          onChange={(e) => setArea(e.target.value)}
          onBlur={commit}
          aria-label={`Area assigned for ${member.full_name}`}
        />
      </TableCell>
      <TableCell>
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">
              Remove {member.full_name} from this special order
            </span>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
