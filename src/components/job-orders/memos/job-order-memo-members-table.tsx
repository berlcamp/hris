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
import { JobOrderMemoAddMemberDialog } from "./job-order-memo-add-member-dialog";
import {
  removeJobOrderMemoMember,
  updateJobOrderMemoMember,
} from "@/lib/actions/job-order-memo-actions";
import type { JobOrderMemoMember } from "@/lib/types";

interface JobOrderMemoMembersTableProps {
  memoId: string;
  members: JobOrderMemoMember[];
  editable: boolean;
}

export function JobOrderMemoMembersTable({
  memoId,
  members,
  editable,
}: JobOrderMemoMembersTableProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<JobOrderMemoMember | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = await removeJobOrderMemoMember(removeTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${removeTarget.full_name} removed.`);
      setRemoveTarget(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong removing this employee. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Employees{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({members.length})
          </span>
        </h2>
        {editable && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add employees
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No employees on this memo yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Office assignment</TableHead>
                <TableHead className="w-28">Rate</TableHead>
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

      <JobOrderMemoAddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        memoId={memoId}
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
            <AlertDialogTitle>Remove from this memo?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? `Remove ${removeTarget.full_name} from this memorandum? This cannot be undone.`
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
  member: JobOrderMemoMember;
  editable: boolean;
  onRemove: () => void;
  onSaved: () => void;
}

/**
 * Office assignment and rate are editable because both are SNAPSHOTS taken
 * when the employee was added — correcting one before the memo is issued never
 * writes back to hris.job_order_employees.
 */
function MemberRow({
  index,
  member,
  editable,
  onRemove,
  onSaved,
}: MemberRowProps) {
  const [office, setOffice] = useState<string>(member.office_assignment ?? "");
  const [rate, setRate] = useState<number | null>(member.daily_rate);
  const [saving, setSaving] = useState(false);

  // Re-sync local editable state whenever the server-sourced row changes
  // underneath us (router.refresh() after a save), so a stale local value
  // never lingers after a successful commit.
  useEffect(() => {
    setOffice(member.office_assignment ?? "");
    setRate(member.daily_rate);
  }, [member.office_assignment, member.daily_rate]);

  const commit = async () => {
    const nextOffice = office.trim() === "" ? null : office.trim();
    if (nextOffice === member.office_assignment && rate === member.daily_rate) {
      return;
    }
    setSaving(true);
    try {
      const result = await updateJobOrderMemoMember(member.id, {
        office_assignment: nextOffice,
        daily_rate: rate,
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
          value={office}
          disabled={!editable || saving}
          onChange={(e) => setOffice(e.target.value)}
          onBlur={commit}
          aria-label={`Office assignment for ${member.full_name}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-24"
          value={rate ?? ""}
          disabled={!editable || saving}
          onChange={(e) =>
            setRate(e.target.value === "" ? null : Number(e.target.value))
          }
          onBlur={commit}
          aria-label={`Rate for ${member.full_name}`}
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
              Remove {member.full_name} from this memo
            </span>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
