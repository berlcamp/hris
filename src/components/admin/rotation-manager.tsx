"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  deleteScheduleRotation,
  saveScheduleRotation,
  type RotationRow,
} from "@/lib/actions/rotation-actions";
import type { ScheduleRow } from "@/lib/actions/schedule-actions";
import { cn } from "@/lib/utils";

// Rotation templates: a 1–4 week cycle of week × weekday → schedule or REST.
// Shared by the whole LGU, so only schedule managers see this tab. A rotation
// that has been assigned keeps its days (changing them would rewrite past
// DTRs); duplicate it to make a changed copy.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const REST = "__rest__";

type Grid = Record<string, string>; // `${week}-${weekday}` → schedule id | REST

function gridFrom(rotation: RotationRow | null, cycle: number): Grid {
  const g: Grid = {};
  for (let w = 1; w <= cycle; w++) {
    for (let d = 1; d <= 7; d++) g[`${w}-${d}`] = REST;
  }
  for (const day of rotation?.days ?? []) {
    g[`${day.week_no}-${day.iso_weekday}`] = day.schedule_id ?? REST;
  }
  return g;
}

export function shortTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`;
}

export function scheduleLabel(s: Pick<ScheduleRow, "time_in" | "time_out">) {
  return `${shortTime(s.time_in)}–${shortTime(s.time_out)}`;
}

interface Draft {
  id?: string;
  name: string;
  cycle: number;
  notes: string;
  grid: Grid;
  locked: boolean;
}

export function RotationManager({
  rotations,
  schedules,
}: {
  rotations: RotationRow[];
  schedules: ScheduleRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  // The trigger shows the short hours so all seven days fit; the dropdown
  // lists each schedule by name.
  const items = {
    [REST]: "REST",
    ...Object.fromEntries(schedules.map((s) => [s.id, scheduleLabel(s)])),
  };

  const open = (r: RotationRow | null, copy = false) =>
    setDraft({
      id: copy ? undefined : r?.id,
      name: r ? (copy ? `${r.name} (copy)` : r.name) : "",
      cycle: r?.cycle_weeks ?? 1,
      notes: r?.notes ?? "",
      grid: gridFrom(r, r?.cycle_weeks ?? 1),
      locked: !copy && !!r?.in_use,
    });

  const setCycle = (cycle: number) =>
    setDraft((d) => {
      if (!d) return d;
      const grid = gridFrom(null, cycle);
      for (const k of Object.keys(grid)) if (d.grid[k]) grid[k] = d.grid[k];
      return { ...d, cycle, grid };
    });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveScheduleRotation({
        id: draft.id,
        name: draft.name,
        cycle_weeks: draft.cycle,
        notes: draft.notes,
        days: Object.entries(draft.grid).map(([k, v]) => {
          const [w, d] = k.split("-").map(Number);
          return { week_no: w, iso_weekday: d, schedule_id: v === REST ? null : v };
        }),
      });
      toast.success("Rotation saved");
      setDraft(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the rotation");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: RotationRow) => {
    if (!window.confirm(`Delete the rotation “${r.name}”?`)) return;
    try {
      await deleteScheduleRotation(r.id);
      toast.success("Rotation deleted");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the rotation");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A rotation repeats every 1–4 weeks. Each day is a schedule or REST; a
          REST day owes no hours. Assign rotations to employees on the Assign tab.
        </p>
        <Button size="sm" onClick={() => open(null)}>
          <Plus className="h-4 w-4" aria-hidden />
          New rotation
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rotation</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead className="min-w-[420px]">Week 1</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rotations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No rotations yet. Employees without one keep their schedule Monday to Friday.
                </TableCell>
              </TableRow>
            )}
            {rotations.map((r) => {
              const g = gridFrom(r, r.cycle_weeks);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {r.name}
                      {r.in_use && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Days locked: assigned" />
                      )}
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </TableCell>
                  <TableCell>{r.cycle_weeks} wk</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {WEEKDAYS.map((label, i) => {
                        const v = g[`1-${i + 1}`];
                        const s = v === REST ? null : scheduleById.get(v);
                        return (
                          <span
                            key={label}
                            className={cn(
                              "flex min-w-14 flex-col items-center rounded-md border px-1 py-0.5 text-[11px] leading-tight",
                              !s && "border-dashed text-muted-foreground",
                            )}
                          >
                            <span className="font-medium">{label}</span>
                            <span className="tabular-nums">{s ? scheduleLabel(s) : "REST"}</span>
                          </span>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.assigned_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => open(r)} aria-label={`Edit ${r.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => open(r, true)} aria-label={`Duplicate ${r.name}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(r)}
                        disabled={r.in_use}
                        aria-label={`Delete ${r.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit rotation" : "New rotation"}</DialogTitle>
            <DialogDescription>
              Pick a schedule or REST for each day of each week in the cycle.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-1.5">
                  <Label htmlFor="rotation-name">Name</Label>
                  <Input
                    id="rotation-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Week A day / Week B night"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Repeats every</Label>
                  <Select
                    items={{ "1": "1 week", "2": "2 weeks", "3": "3 weeks", "4": "4 weeks" }}
                    value={String(draft.cycle)}
                    onValueChange={(v) => v && setCycle(Number(v))}
                    disabled={draft.locked}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} week{n > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {draft.locked && (
                <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  This rotation has been assigned, so its days are locked — changing
                  them would rewrite DTRs it already covered. Duplicate it, change the
                  copy, and assign the copy from a date.
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] table-fixed text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-20 p-2 text-left font-medium">Week</th>
                      {WEEKDAYS.map((d) => (
                        <th key={d} className="p-2 text-left font-medium">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: draft.cycle }, (_, wi) => wi + 1).map((w) => (
                      <tr key={w} className="border-b last:border-0">
                        <th scope="row" className="whitespace-nowrap p-2 text-left font-medium">
                          Week {w}
                        </th>
                        {WEEKDAYS.map((label, di) => {
                          const key = `${w}-${di + 1}`;
                          const v = draft.grid[key];
                          return (
                            <td key={key} className="p-1">
                              <Select
                                items={items}
                                value={v}
                                disabled={draft.locked}
                                onValueChange={(nv) =>
                                  nv && setDraft({ ...draft, grid: { ...draft.grid, [key]: nv as string } })
                                }
                              >
                                <SelectTrigger
                                  className={cn("h-8 w-full px-2 text-xs tabular-nums", v === REST && "text-muted-foreground")}
                                  aria-label={`Week ${w} ${label}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={REST}>REST</SelectItem>
                                  {schedules.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name} ({scheduleLabel(s)})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rotation-notes">Notes</Label>
                <Textarea
                  id="rotation-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Optional — e.g. which office or post uses it"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !draft?.name.trim()}>
              {saving ? "Saving…" : "Save rotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
