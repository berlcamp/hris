"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  assignScheduleRotation,
  type AssignableEmployee,
  type ResortSummary,
  type RotationRow,
} from "@/lib/actions/rotation-actions";

// Puts employees on a rotation from a date (or back on their base schedule).
// Schedule managers see everyone; a department admin sees their department.

const BASE = "__base__";
const ALL = "__all__";

export function resortMessage(r: ResortSummary): string {
  const parts = [`${r.written} day${r.written === 1 ? "" : "s"} re-sorted from saved punches`];
  if (r.cleared > 0) parts.push(`${r.cleared} moved to the night before`);
  if (r.protectedSkipped > 0) {
    parts.push(`${r.protectedSkipped} hand-corrected day${r.protectedSkipped === 1 ? "" : "s"} left as is`);
  }
  return parts.join(" · ");
}

export function RotationAssigner({
  employees,
  rotations,
  today,
}: {
  employees: AssignableEmployee[];
  rotations: RotationRow[];
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rotationId, setRotationId] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [startWeek, setStartWeek] = useState("1");
  const [saving, setSaving] = useState(false);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter((d): d is string => !!d))].sort(),
    [employees],
  );
  const visible = employees.filter(
    (e) =>
      (department === ALL || e.department === department) &&
      (!query ||
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        String(e.biometric_no ?? "").includes(query)),
  );
  const rotation = rotations.find((r) => r.id === rotationId);
  const cycle = rotation?.cycle_weeks ?? 1;
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const e of visible) {
        if (allVisibleSelected) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });

  const assign = async () => {
    setSaving(true);
    try {
      const res = await assignScheduleRotation({
        employeeIds: [...selected],
        rotationId: rotationId === BASE ? null : rotationId,
        effectiveFrom,
        startWeek: Number(startWeek),
      });
      toast.success(
        `${res.assigned} employee${res.assigned === 1 ? "" : "s"} updated`,
        { description: resortMessage(res.resort) },
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign the rotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or biometric no."
              aria-label="Search employees"
            />
          </div>
          {departments.length > 1 && (
            <Select
              items={{ [ALL]: "All departments", ...Object.fromEntries(departments.map((d) => [d, d])) }}
              value={department}
              onValueChange={(v) => v && setDepartment(v as string)}
            >
              <SelectTrigger className="w-56" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all shown"
                  />
                </TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Base schedule</TableHead>
                <TableHead>Rotation today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((e) => (
                <TableRow
                  key={e.id}
                  data-state={selected.has(e.id) ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => toggle(e.id)}
                >
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(e.id)}
                      onCheckedChange={() => toggle(e.id)}
                      aria-label={`Select ${e.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{e.name}</div>
                    {e.biometric_no != null && (
                      <div className="text-xs text-muted-foreground">#{e.biometric_no}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{e.department ?? "—"}</TableCell>
                  <TableCell className="text-sm">{e.base_schedule ?? "Default"}</TableCell>
                  <TableCell className="text-sm">
                    {e.rotation ?? <span className="text-muted-foreground">None</span>}
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No employees match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="h-fit space-y-4 rounded-lg border p-4 lg:sticky lg:top-4">
        <div>
          <h3 className="text-sm font-semibold">Assign</h3>
          <p className="text-xs text-muted-foreground">
            {selected.size} employee{selected.size === 1 ? "" : "s"} selected
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Rotation</Label>
          <Select
            items={{
              [BASE]: "Back to base schedule (Mon–Fri)",
              ...Object.fromEntries(rotations.map((r) => [r.id, r.name])),
            }}
            value={rotationId || null}
            onValueChange={(v) => {
              setRotationId((v as string) ?? "");
              setStartWeek("1");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a rotation" />
            </SelectTrigger>
            <SelectContent>
              {rotations.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
              <SelectItem value={BASE}>Back to base schedule (Mon–Fri)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effective-from">Starting</Label>
          <Input
            id="effective-from"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        {rotation && cycle > 1 && (
          <div className="space-y-1.5">
            <Label>That week is</Label>
            <Select
              items={Object.fromEntries(
                Array.from({ length: cycle }, (_, i) => [String(i + 1), `Week ${i + 1} of the cycle`]),
              )}
              value={startWeek}
              onValueChange={(v) => v && setStartWeek(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: cycle }, (_, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    Week {i + 1} of the cycle
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Days that already have punches are re-sorted right away, from the start
          date (no earlier than last month). Hand-corrected days are never changed.
        </p>
        <Button
          className="w-full"
          onClick={assign}
          disabled={saving || selected.size === 0 || !rotationId || !effectiveFrom}
        >
          {saving ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
