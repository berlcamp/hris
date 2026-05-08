"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Trash2, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  getJoPayrollById,
  addJoPayrollMember,
  updateJoPayrollMember,
  deleteJoPayrollMember,
  type JoPayrollMemberWithEmployee,
  type JoPayrollListRow,
  type JoEmployeeForPayroll,
} from "@/lib/actions/jo-payroll-actions";
import {
  computeJoGross,
  computeJoNetAmount,
  computeJoSssDeduction,
} from "@/lib/utils/joPayrollAmount";

interface Props {
  payroll: JoPayrollListRow | null;
  joEmployees: JoEmployeeForPayroll[];
  onOpenChange: (o: boolean) => void;
  onChange?: () => void;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtName(e: JoPayrollMemberWithEmployee["employees"]): string {
  if (!e) return "—";
  return `${e.last_name}, ${e.first_name}${e.middle_name ? " " + e.middle_name : ""}`;
}

export function JoPayrollDetailModal({
  payroll,
  joEmployees,
  onOpenChange,
  onChange,
}: Props) {
  const open = !!payroll;
  const [meta, setMeta] = useState<JoPayrollListRow | null>(null);
  const [members, setMembers] = useState<JoPayrollMemberWithEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");
  const [deleteTarget, setDeleteTarget] =
    useState<JoPayrollMemberWithEmployee | null>(null);

  const refresh = useCallback(async () => {
    if (!payroll) return;
    setLoading(true);
    const { payroll: p, members: ms } = await getJoPayrollById(payroll.id);
    setMeta(p);
    setMembers(ms);
    setLoading(false);
  }, [payroll]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data refresh
      void refresh();
    } else {
      setMeta(null);
      setMembers([]);
      setSelectedToAdd("");
    }
  }, [open, refresh]);

  const existingIds = new Set(members.map((m) => m.employee_id));
  const available = joEmployees.filter((e) => !existingIds.has(e.id));

  const handleAdd = async () => {
    if (!payroll || !selectedToAdd) return;
    setAdding(true);
    const res = await addJoPayrollMember({
      payroll_id: payroll.id,
      employee_id: selectedToAdd,
      days: meta?.days ?? null,
    });
    setAdding(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    setSelectedToAdd("");
    onChange?.();
    void refresh();
  };

  const handleFieldBlur = async (
    member: JoPayrollMemberWithEmployee,
    patch: { days?: number | null; hours?: number | null; rate?: number | null },
  ) => {
    const res = await updateJoPayrollMember(member.id, {
      days: patch.days ?? member.days,
      hours: patch.hours ?? member.hours,
      rate: patch.rate ?? member.rate,
    });
    if ("error" in res && res.error) {
      toast.error(res.error);
    } else {
      onChange?.();
      void refresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deleteJoPayrollMember(deleteTarget.id);
    if ("error" in res && res.error) {
      toast.error(res.error);
    } else {
      toast.success("Member removed");
      onChange?.();
      void refresh();
    }
    setDeleteTarget(null);
  };

  const grandGross = members.reduce(
    (s, m) => s + computeJoGross(Number(m.rate), Number(m.days)),
    0,
  );
  const grandSss = members.reduce(
    (s, m) =>
      s +
      computeJoSssDeduction(
        Number(m.employees?.sss_ss),
        Number(m.employees?.sss_ec),
      ),
    0,
  );
  const grandNet = grandGross - grandSss;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              JO Payroll:{" "}
              {meta
                ? `${format(new Date(meta.period_start), "MMM d, yyyy")} – ${format(
                    new Date(meta.period_end),
                    "MMM d, yyyy",
                  )}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              {meta?.description && <div>{meta.description}</div>}
              {meta?.areas && (
                <div className="text-xs text-muted-foreground">
                  Areas: {meta.areas} · Default days: {meta.days ?? "—"}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-medium mb-2">Add JO Employee</div>
            <div className="flex gap-2">
              <Select
                value={selectedToAdd}
                onValueChange={(v) => setSelectedToAdd(v ?? "")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an employee…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.last_name}, {e.first_name}
                      {e.middle_name ? " " + e.middle_name : ""} ·{" "}
                      {e.area_assigned ?? "—"} · ₱{e.daily_rate ?? "—"}/day
                    </SelectItem>
                  ))}
                  {available.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No more JO employees available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAdd}
                disabled={!selectedToAdd || adding}
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">SS+EC</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                      No members in this payroll yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {members.map((m, i) => {
                      const sss = computeJoSssDeduction(
                        Number(m.employees?.sss_ss),
                        Number(m.employees?.sss_ec),
                      );
                      const gross = computeJoGross(
                        Number(m.rate),
                        Number(m.days),
                      );
                      const net = computeJoNetAmount({
                        rate: Number(m.rate),
                        days: Number(m.days),
                        sss_ss: Number(m.employees?.sss_ss),
                        sss_ec: Number(m.employees?.sss_ec),
                      });
                      return (
                        <TableRow key={m.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {fmtName(m.employees)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {m.employees?.area_assigned ?? "—"}
                              {m.employees?.has_atm
                                ? ` · ATM ${m.employees?.account_number ?? ""}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              defaultValue={m.rate ?? ""}
                              className="h-7 w-24 text-right"
                              onBlur={(e) => {
                                const v = e.target.value
                                  ? Number(e.target.value)
                                  : null;
                                if (v !== Number(m.rate)) {
                                  void handleFieldBlur(m, { rate: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.5"
                              defaultValue={m.days ?? ""}
                              className="h-7 w-20 text-right"
                              onBlur={(e) => {
                                const v = e.target.value
                                  ? Number(e.target.value)
                                  : null;
                                if (v !== Number(m.days)) {
                                  void handleFieldBlur(m, { days: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.5"
                              defaultValue={m.hours ?? ""}
                              className="h-7 w-20 text-right"
                              onBlur={(e) => {
                                const v = e.target.value
                                  ? Number(e.target.value)
                                  : null;
                                if (v !== Number(m.hours)) {
                                  void handleFieldBlur(m, { hours: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtNum(gross)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtNum(sss)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {fmtNum(net)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(m)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={5} className="text-right">
                        Grand Total
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtNum(grandGross)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtNum(grandSss)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtNum(grandNet)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {fmtName(deleteTarget?.employees ?? null)} will be removed from
              this payroll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
