"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildEventRoster,
  previewEventCandidates,
} from "@/lib/actions/event-actions";
import { EMPLOYMENT_LABELS } from "@/lib/event-repo";
import type { EventSubjectKind } from "@/lib/types";

const KINDS: EventSubjectKind[] = ["employee", "job_order", "cos"];

export function EventRosterBuilder({
  eventId,
  departments,
  areas,
  orphanedLegacyCount,
  rosterCount,
  disabled,
}: {
  eventId: string;
  departments: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  orphanedLegacyCount: number;
  rosterCount: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [kinds, setKinds] = useState<EventSubjectKind[]>(["employee"]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, startPreview] = useTransition();
  const [building, setBuilding] = useState(false);

  const needsDepartments = kinds.includes("employee") || kinds.includes("cos");
  const needsAreas = kinds.includes("job_order");

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const filterKey = useMemo(
    () => JSON.stringify({ kinds, departmentIds, areaIds }),
    [kinds, departmentIds, areaIds],
  );

  useEffect(() => {
    if (kinds.length === 0) {
      setPreviewCount(0);
      return;
    }
    startPreview(async () => {
      const rows = await previewEventCandidates({
        kinds,
        department_ids: departmentIds,
        area_ids: areaIds,
      });
      setPreviewCount(rows.length);
    });
    // filterKey is the value that actually changes; the individual arrays are
    // new references on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const handleBuild = async () => {
    setBuilding(true);
    const result = await buildEventRoster({
      event_id: eventId,
      kinds,
      department_ids: departmentIds,
      area_ids: areaIds,
    });
    setBuilding(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Roster built — ${result.data?.count ?? 0} expected`);
    router.refresh();
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Roster</h2>
          <p className="text-muted-foreground text-xs">
            Snapshotted when built, so later hires and transfers do not rewrite
            who was expected.
          </p>
        </div>
        <Badge variant="outline">{rosterCount} on the roster</Badge>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Personnel type</Label>
        <div className="flex flex-wrap gap-4">
          {KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={kinds.includes(kind)}
                onCheckedChange={() => setKinds((k) => toggle(k, kind))}
                disabled={disabled}
              />
              {EMPLOYMENT_LABELS[kind]}
            </label>
          ))}
        </div>
      </div>

      {needsDepartments && (
        <div className="space-y-2">
          <Label className="text-xs">
            Departments{" "}
            <span className="text-muted-foreground font-normal">
              — Plantilla and COS. Leave empty for all.
            </span>
          </Label>
          <ScrollArea className="h-32 rounded-md border p-2">
            <div className="grid grid-cols-2 gap-1">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={departmentIds.includes(d.id)}
                    onCheckedChange={() => setDepartmentIds((v) => toggle(v, d.id))}
                    disabled={disabled}
                  />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {needsAreas && (
        <div className="space-y-2">
          <Label className="text-xs">
            Areas{" "}
            <span className="text-muted-foreground font-normal">
              — Job Order personnel are organised by area, not department. Leave
              empty for all.
            </span>
          </Label>
          <ScrollArea className="h-32 rounded-md border p-2">
            <div className="grid grid-cols-2 gap-1">
              {areas.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={areaIds.includes(a.id)}
                    onCheckedChange={() => setAreaIds((v) => toggle(v, a.id))}
                    disabled={disabled}
                  />
                  <span className="truncate">{a.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {orphanedLegacyCount > 0 && (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {orphanedLegacyCount} active Job Order/COS record
            {orphanedLegacyCount === 1 ? " sits" : "s sit"} only in the legacy
            employees table and cannot be added here or issued a card. They need
            to be entered in the Job Order or COS registry first.
          </span>
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => void handleBuild()}
          disabled={disabled || building || kinds.length === 0}
        >
          {building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {rosterCount > 0 ? "Rebuild roster" : "Build roster"}
        </Button>
        <span className="text-muted-foreground text-xs">
          {previewing ? (
            <Loader2 className="inline h-3 w-3 animate-spin" />
          ) : (
            `${previewCount ?? 0} match these filters`
          )}
        </span>
      </div>

      {disabled && (
        <p className="text-muted-foreground text-xs">
          The roster is locked because this event is closed.
        </p>
      )}
    </div>
  );
}
