"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEmployeesForSchedule,
  assignEmployeesToSchedule,
  unassignEmployeesFromSchedule,
  type ScheduleWithAssignedCount,
} from "@/lib/actions/schedule-actions";

interface ScheduleAssignmentDialogProps {
  schedule: ScheduleWithAssignedCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmployeeRow {
  id: string;
  biometric_no: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  department: string | null;
}

export function ScheduleAssignmentDialog({
  schedule,
  open,
  onOpenChange,
}: ScheduleAssignmentDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assigned, setAssigned] = useState<EmployeeRow[]>([]);
  const [unassigned, setUnassigned] = useState<EmployeeRow[]>([]);
  const [removeSelection, setRemoveSelection] = useState<Set<string>>(new Set());
  const [addSelection, setAddSelection] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getEmployeesForSchedule(schedule.id),
      getEmployeesForSchedule(null),
    ])
      .then(([a, u]) => {
        if (cancelled) return;
        setAssigned(a);
        setUnassigned(u);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load employees");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schedule.id]);

  const filteredUnassigned = unassigned.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      String(e.biometric_no).includes(q) ||
      (e.department ?? "").toLowerCase().includes(q)
    );
  });

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const allRemoveChecked =
    assigned.length > 0 && removeSelection.size === assigned.length;
  const someRemoveChecked =
    removeSelection.size > 0 && removeSelection.size < assigned.length;

  const toggleAllRemove = () => {
    setRemoveSelection(
      allRemoveChecked ? new Set() : new Set(assigned.map((e) => e.id)),
    );
  };

  const allAddChecked =
    filteredUnassigned.length > 0 &&
    filteredUnassigned.every((e) => addSelection.has(e.id));
  const someAddChecked =
    filteredUnassigned.some((e) => addSelection.has(e.id)) && !allAddChecked;

  const toggleAllAdd = () => {
    setAddSelection((prev) => {
      const next = new Set(prev);
      if (allAddChecked) {
        for (const e of filteredUnassigned) next.delete(e.id);
      } else {
        for (const e of filteredUnassigned) next.add(e.id);
      }
      return next;
    });
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const ops: Promise<{ updated: number; error?: string }>[] = [];
      if (addSelection.size > 0) {
        ops.push(assignEmployeesToSchedule(schedule.id, [...addSelection]));
      }
      if (removeSelection.size > 0) {
        ops.push(unassignEmployeesFromSchedule([...removeSelection]));
      }
      if (ops.length === 0) {
        onOpenChange(false);
        return;
      }
      const results = await Promise.all(ops);
      const err = results.find((r) => r.error)?.error;
      if (err) {
        toast.error(err);
        return;
      }
      const totalChanged = results.reduce((s, r) => s + r.updated, 0);
      toast.success(`${totalChanged} employee${totalChanged === 1 ? "" : "s"} updated.`);
      router.refresh();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const fullName = (e: EmployeeRow) =>
    `${e.last_name}, ${e.first_name}${e.middle_name ? ` ${e.middle_name.charAt(0)}.` : ""}`;

  const pendingChanges = addSelection.size + removeSelection.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign employees — {schedule.name}</DialogTitle>
          <DialogDescription>
            Add or remove employees on this schedule. Only active employees are
            shown. Each employee can only belong to one schedule.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Assigned (remove side) */}
            <div className="border rounded-md flex flex-col min-h-[360px]">
              <div className="border-b px-3 py-2 flex items-center justify-between bg-muted/40">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allRemoveChecked}
                    indeterminate={someRemoveChecked}
                    onCheckedChange={toggleAllRemove}
                    disabled={assigned.length === 0}
                    aria-label="Select all assigned"
                  />
                  <p className="text-sm font-medium">
                    Assigned{" "}
                    <Badge variant="secondary" className="ml-1">
                      {assigned.length}
                    </Badge>
                  </p>
                </div>
                {removeSelection.size > 0 && (
                  <span className="text-xs text-destructive">
                    {removeSelection.size} to remove
                  </span>
                )}
              </div>
              <ScrollArea className="flex-1 max-h-[360px]">
                {assigned.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 px-4">
                    No employees assigned yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {assigned.map((e) => {
                      const checked = removeSelection.has(e.id);
                      return (
                        <li
                          key={e.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              setRemoveSelection((s) => toggle(s, e.id))
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {fullName(e)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {e.department ?? "—"} · #{e.biometric_no}
                            </p>
                          </div>
                          {checked && <X className="h-4 w-4 text-destructive" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>

            {/* Unassigned (add side) */}
            <div className="border rounded-md flex flex-col min-h-[360px]">
              <div className="border-b px-3 py-2 space-y-2 bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allAddChecked}
                      indeterminate={someAddChecked}
                      onCheckedChange={toggleAllAdd}
                      disabled={filteredUnassigned.length === 0}
                      aria-label="Select all unassigned"
                    />
                    <p className="text-sm font-medium">
                      Unassigned{" "}
                      <Badge variant="secondary" className="ml-1">
                        {unassigned.length}
                      </Badge>
                    </p>
                  </div>
                  {addSelection.size > 0 && (
                    <span className="text-xs text-green-600">
                      {addSelection.size} to add
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, dept, biometric…"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1 max-h-[360px]">
                {filteredUnassigned.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 px-4">
                    {unassigned.length === 0
                      ? "All active employees already have a schedule."
                      : "No matches."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filteredUnassigned.map((e) => {
                      const checked = addSelection.has(e.id);
                      return (
                        <li
                          key={e.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              setAddSelection((s) => toggle(s, e.id))
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {fullName(e)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {e.department ?? "—"} · #{e.biometric_no}
                            </p>
                          </div>
                          {checked && <Plus className="h-4 w-4 text-green-600" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={submitting || pendingChanges === 0}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply {pendingChanges > 0 ? `(${pendingChanges})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
