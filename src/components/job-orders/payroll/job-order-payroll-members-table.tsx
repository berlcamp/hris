"use client";

import { Fragment, useEffect, useState } from "react";
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
import { JobOrderPayrollAddMemberDialog } from "./job-order-payroll-add-member-dialog";
import { updateJobOrderPayrollMember, removeJobOrderPayrollMember } from "@/lib/actions/job-order-payroll-member-actions";
import {
  computeJoGross,
  computeJoNetAmount,
  computeJoOvertimeGross,
  computeJoSssDeduction,
} from "@/lib/job-order-payroll-helpers";
import type { JobOrderPayrollMember } from "@/lib/types";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

interface JobOrderPayrollMembersTableProps {
  payrollId: string;
  members: JobOrderPayrollMember[];
  editable: boolean;
}

/** A run of consecutive members sharing the same area, built by walking the
 * already-sorted (area_name, full_name) list — never re-sorted here. */
interface AreaGroup {
  area: string | null;
  members: JobOrderPayrollMember[];
}

function groupByArea(members: JobOrderPayrollMember[]): AreaGroup[] {
  const groups: AreaGroup[] = [];
  for (const m of members) {
    const last = groups[groups.length - 1];
    if (last && last.area === m.area_name) {
      last.members.push(m);
    } else {
      groups.push({ area: m.area_name, members: [m] });
    }
  }
  return groups;
}

export function JobOrderPayrollMembersTable({
  payrollId,
  members,
  editable,
}: JobOrderPayrollMembersTableProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<JobOrderPayrollMember | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  const groups = groupByArea(members);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = await removeJobOrderPayrollMember(removeTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${removeTarget.full_name} removed.`);
      setRemoveTarget(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong removing this member. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members</h2>
        {editable && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No members on this payroll yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sub-area</TableHead>
                <TableHead>LandBank ATM</TableHead>
                <TableHead className="w-20">Days</TableHead>
                <TableHead className="w-20">Hours</TableHead>
                <TableHead className="w-24">Rate</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">SSS</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <Fragment key={g.area ?? "no-area"}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={10} className="py-2 text-sm font-semibold">
                      {g.area ?? "No area"}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({g.members.length})
                      </span>
                    </TableCell>
                  </TableRow>
                  {g.members.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      editable={editable}
                      onRemove={() => setRemoveTarget(m)}
                      onSaved={() => router.refresh()}
                    />
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <JobOrderPayrollAddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        payrollId={payrollId}
        onAdded={() => {
          router.refresh();
        }}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? `Remove ${removeTarget.full_name} from this payroll? This cannot be undone.`
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
  member: JobOrderPayrollMember;
  editable: boolean;
  onRemove: () => void;
  onSaved: () => void;
}

function MemberRow({ member, editable, onRemove, onSaved }: MemberRowProps) {
  const [days, setDays] = useState<number | null>(member.days);
  const [hours, setHours] = useState<number | null>(member.hours);
  const [rate, setRate] = useState<number | null>(member.daily_rate);
  const [saving, setSaving] = useState(false);

  // Re-sync local editable state whenever the server-sourced member row
  // changes underneath us (e.g. router.refresh() after a save elsewhere), so
  // a stale local value never lingers after a successful commit.
  useEffect(() => {
    setDays(member.days);
    setHours(member.hours);
    setRate(member.daily_rate);
  }, [member.days, member.hours, member.daily_rate]);

  // Gross and net both include overtime, so this row matches what the payroll
  // prints. Computed off the live local state, not `member`, so the figures
  // track what the user is typing before the blur-commit lands.
  const gross =
    computeJoGross(rate, days) + computeJoOvertimeGross(rate, hours);
  const sss = computeJoSssDeduction(member.sss_ss, member.sss_ec);
  const net = computeJoNetAmount({
    rate,
    days,
    hours,
    sss_ss: member.sss_ss,
    sss_ec: member.sss_ec,
  });

  const commit = async () => {
    if (
      days === member.days &&
      hours === member.hours &&
      rate === member.daily_rate
    ) {
      return;
    }
    setSaving(true);
    try {
      const result = await updateJobOrderPayrollMember(member.id, {
        days,
        hours,
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

  const toNum = (v: string): number | null => (v === "" ? null : Number(v));

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{member.full_name}</div>
        {member.job_order_employee_id === null && (
          <p className="text-xs italic text-muted-foreground">
            Roster link removed — snapshot preserved
          </p>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {member.sub_area ?? "—"}
      </TableCell>
      {/* The snapshot's account number, not the roster's: this is exactly what
          the ATM payroll prints, so a blank here is the warning that the row
          needs "Refresh from roster" before printing. */}
      <TableCell className="tabular-nums text-muted-foreground">
        {member.landbank_account_number ?? "—"}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-16"
          value={days ?? ""}
          disabled={!editable || saving}
          onChange={(e) => setDays(toNum(e.target.value))}
          onBlur={commit}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-16"
          value={hours ?? ""}
          disabled={!editable || saving}
          onChange={(e) => setHours(toNum(e.target.value))}
          onBlur={commit}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-20"
          value={rate ?? ""}
          disabled={!editable || saving}
          onChange={(e) => setRate(toNum(e.target.value))}
          onBlur={commit}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtMoney(gross)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtMoney(sss)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {fmtMoney(net)}
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
              Remove {member.full_name} from this payroll
            </span>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
