"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Pencil, Trash2, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  getPayrollById,
  getAvailableEmployeesForPayroll,
  addEmployeesToPayroll,
  deleteEmployeePayroll,
  type EmployeePayrollWithEmployee,
  type AvailableEmployeeRow,
  type PayrollListRow,
} from "@/lib/actions/payroll-actions";
import { PayrollEditEmployeeModal } from "./payroll-edit-employee-modal";

interface Props {
  payroll: PayrollListRow | null;
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

function fmtName(e: EmployeePayrollWithEmployee["employees"]): string {
  if (!e) return "—";
  return `${e.last_name}, ${e.first_name}${e.middle_name ? " " + e.middle_name : ""}`;
}

export function PayrollDetailModal({ payroll, onOpenChange, onChange }: Props) {
  const open = !!payroll;
  const [meta, setMeta] = useState<{
    id: string;
    period_start: string;
    period_end: string;
    particulars: string | null;
    particulars_2nd_half: string | null;
  } | null>(null);
  const [employees, setEmployees] = useState<EmployeePayrollWithEmployee[]>([]);
  const [available, setAvailable] = useState<AvailableEmployeeRow[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] =
    useState<EmployeePayrollWithEmployee | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<EmployeePayrollWithEmployee | null>(null);

  const refresh = useCallback(async () => {
    if (!payroll) return;
    setLoading(true);
    const [{ payroll: p, employees: emps }, avail] = await Promise.all([
      getPayrollById(payroll.id),
      getAvailableEmployeesForPayroll(payroll.id),
    ]);
    setMeta(p);
    setEmployees(emps);
    setAvailable(avail);
    setLoading(false);
  }, [payroll]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data refresh
      void refresh();
    } else {
      setMeta(null);
      setEmployees([]);
      setAvailable([]);
      setSelectedToAdd("");
    }
  }, [open, refresh]);

  const handleAdd = async () => {
    if (!payroll || !selectedToAdd) return;
    setAdding(true);
    const res = await addEmployeesToPayroll({
      payroll_id: payroll.id,
      employee_ids: [selectedToAdd],
    });
    setAdding(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Employee added");
    setSelectedToAdd("");
    onChange?.();
    void refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deleteEmployeePayroll(deleteTarget.id);
    if ("error" in res && res.error) {
      toast.error(res.error);
    } else {
      toast.success("Employee removed");
      onChange?.();
      void refresh();
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payroll:{" "}
              {meta
                ? `${format(new Date(meta.period_start), "MMM d, yyyy")} – ${format(
                    new Date(meta.period_end),
                    "MMM d, yyyy",
                  )}`
                : ""}
            </DialogTitle>
            {(meta?.particulars || meta?.particulars_2nd_half) && (
              <DialogDescription render={<div />} className="space-y-1">
                {meta?.particulars && (
                  <div>
                    <strong>1st Half:</strong> {meta.particulars}
                  </div>
                )}
                {meta?.particulars_2nd_half && (
                  <div>
                    <strong>2nd Half:</strong> {meta.particulars_2nd_half}
                  </div>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-medium mb-2">Add Employee</div>
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
                      {e.position_title ?? "—"}
                    </SelectItem>
                  ))}
                  {available.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No active plantilla employees available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAdd}
                disabled={!selectedToAdd || adding}
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
                  <TableHead>Designation</TableHead>
                  <TableHead className="text-right">Monthly Rate</TableHead>
                  <TableHead className="text-right">1st Half</TableHead>
                  <TableHead className="text-right">2nd Half</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      No employees in this payroll yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((emp, i) => (
                    <TableRow key={emp.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{fmtName(emp.employees)}</div>
                        <div className="text-xs text-muted-foreground">
                          {emp.employees?.departments?.code ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {emp.designation ?? emp.employees?.positions?.title ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtNum(emp.monthly_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtNum(emp.amount_received)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtNum(emp.amount_received_2nd_half)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(emp)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(emp)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <PayrollEditEmployeeModal
        target={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          onChange?.();
          void refresh();
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove employee from payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              {fmtName(deleteTarget?.employees ?? null)} will be removed from
              this payroll. Their record can be re-added later.
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
