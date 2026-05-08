"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createJoPayroll,
  type JoEmployeeForPayroll,
} from "@/lib/actions/jo-payroll-actions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  joEmployees: JoEmployeeForPayroll[];
  onSuccess?: () => void;
}

export function JoPayrollAddModal({
  open,
  onOpenChange,
  joEmployees,
  onSuccess,
}: Props) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [days, setDays] = useState("");
  const [description, setDescription] = useState("");
  const [particulars, setParticulars] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form init from props
    setPeriodStart(today);
    setPeriodEnd(today);
    setDays("");
    setDescription("");
    setParticulars("");
    setSelected(new Set());
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<string, JoEmployeeForPayroll[]>();
    for (const e of joEmployees) {
      const key = e.area_assigned ?? "(Unassigned)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [joEmployees]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArea = (members: JoEmployeeForPayroll[]) => {
    const allSelected = members.every((m) => selected.has(m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of members) {
        if (allSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("Select at least one employee");
      return;
    }
    setSaving(true);
    const res = await createJoPayroll({
      period_start: periodStart,
      period_end: periodEnd,
      description: description || null,
      particulars: particulars || null,
      days: days ? Number(days) : null,
      payroll_date: null,
      employee_ids: Array.from(selected),
    });
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Payroll created");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create JO Payroll</DialogTitle>
          <DialogDescription>
            Pick the period, default days, and the employees to include. The
            employee&apos;s daily rate is snapshotted on the member row.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default Days</Label>
              <Input
                type="number"
                step="0.5"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Particulars (OBR/payroll header)</Label>
            <Textarea
              rows={2}
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Employees ({selected.size} selected)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set(joEmployees.map((e) => e.id)))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="h-72 rounded-md border">
              <div className="space-y-3 p-3">
                {grouped.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No active JO employees yet. Mark employees as employment
                    type &ldquo;jo&rdquo; in the Employees module first.
                  </div>
                ) : (
                  grouped.map(([area, members]) => {
                    const allSelected = members.every((m) =>
                      selected.has(m.id),
                    );
                    return (
                      <div
                        key={area}
                        className="rounded border bg-muted/40"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left"
                          onClick={() => toggleArea(members)}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {area} ({members.length})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {allSelected ? "Deselect all" : "Select all"}
                          </span>
                        </button>
                        <div className="space-y-1 px-3 pb-2">
                          {members.map((e) => (
                            <label
                              key={e.id}
                              className="flex items-center gap-2 cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={selected.has(e.id)}
                                onCheckedChange={() => toggle(e.id)}
                              />
                              <span>
                                {e.last_name}, {e.first_name}
                                {e.middle_name ? " " + e.middle_name : ""}
                              </span>
                              <span className="ml-auto text-xs text-muted-foreground font-mono">
                                ₱{e.daily_rate ?? "—"}/day
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
