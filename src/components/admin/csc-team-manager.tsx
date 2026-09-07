"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table as ReactTableInstance } from "@tanstack/react-table";
import { Loader2, PencilLine, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DataTable } from "@/components/tables/data-table";
import {
  UNASSIGNED,
  cscTeamColumns,
} from "@/components/tables/columns/csc-team-columns";
import {
  assignCscTeam,
  renameCscTeam,
  type CscTeamMember,
  type CscTeamPersonRef,
} from "@/lib/actions/csc-team-actions";

// Sentinel values for the team <Select>. Radix treats "" as "no value", so both
// choices need a real string of their own.
const NONE = "__none__";
const NEW_TEAM = "__new__";

interface CscTeamManagerProps {
  members: CscTeamMember[];
  teams: string[];
}

/** Who the open dialog is about: one person from the row menu, or the selection. */
interface AssignTarget {
  refs: CscTeamPersonRef[];
  label: string;
  /** Pre-selected in the dialog when a single person already has a team. */
  currentTeam: string | null;
}

function toRef(m: CscTeamMember): CscTeamPersonRef {
  return { subject_kind: m.subject_kind, subject_id: m.subject_id };
}

export function CscTeamManager({ members, teams }: CscTeamManagerProps) {
  const router = useRouter();

  // Held rather than passed down so the bulk button in the toolbar — the only
  // place with the table instance — can clear the selection after a save.
  const tableRef = useRef<ReactTableInstance<CscTeamMember> | null>(null);

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [teamChoice, setTeamChoice] = useState<string>(NONE);
  const [newTeam, setNewTeam] = useState("");
  const [saving, setSaving] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState<string>("");
  const [renameTo, setRenameTo] = useState("");
  const [renaming, setRenaming] = useState(false);

  const counts = useMemo(() => {
    const byTeam = new Map<string, number>();
    let unassigned = 0;
    for (const m of members) {
      if (!m.csc_team) {
        unassigned += 1;
        continue;
      }
      byTeam.set(m.csc_team, (byTeam.get(m.csc_team) ?? 0) + 1);
    }
    return { byTeam, unassigned };
  }, [members]);

  const filterableColumns = useMemo(
    () => [
      {
        id: "employment_label",
        title: "Registry",
        options: [...new Set(members.map((m) => m.employment_label))]
          .sort()
          .map((v) => ({ label: v, value: v })),
      },
      {
        id: "team",
        title: "Team",
        options: [
          ...teams.map((t) => ({ label: t, value: t })),
          { label: UNASSIGNED, value: UNASSIGNED },
        ],
      },
    ],
    [members, teams],
  );

  const openAssign = useCallback((target: AssignTarget) => {
    setAssignTarget(target);
    setTeamChoice(target.currentTeam ?? NONE);
    setNewTeam("");
  }, []);

  const openBulkAssign = (table: ReactTableInstance<CscTeamMember>) => {
    const rows = table.getFilteredSelectedRowModel().rows;
    if (rows.length === 0) return;
    openAssign({
      refs: rows.map((r) => toRef(r.original)),
      label: `${rows.length} selected ${rows.length === 1 ? "person" : "people"}`,
      currentTeam: null,
    });
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    const team =
      teamChoice === NONE ? null : teamChoice === NEW_TEAM ? newTeam : teamChoice;
    if (teamChoice === NEW_TEAM && !newTeam.trim()) {
      toast.error("Type a name for the new team");
      return;
    }

    setSaving(true);
    const result = await assignCscTeam(assignTarget.refs, team);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      team
        ? `${result.data?.updated ?? 0} assigned to ${team.trim()}`
        : `${result.data?.updated ?? 0} removed from their team`,
    );
    setAssignTarget(null);
    tableRef.current?.resetRowSelection();
    router.refresh();
  };

  const handleRemove = useCallback(
    async (member: CscTeamMember) => {
      const result = await assignCscTeam([toRef(member)], null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${member.full_name} removed from their team`);
      router.refresh();
    },
    [router],
  );

  const handleRename = async () => {
    if (!renameFrom) {
      toast.error("Pick the team to rename");
      return;
    }
    setRenaming(true);
    const result = await renameCscTeam(renameFrom, renameTo);
    setRenaming(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Renamed — ${result.data?.updated ?? 0} records updated`);
    setRenameOpen(false);
    setRenameFrom("");
    setRenameTo("");
    router.refresh();
  };

  const columns = useMemo(
    () =>
      cscTeamColumns({
        onAssign: (m) =>
          openAssign({
            refs: [toRef(m)],
            label: m.full_name,
            currentTeam: m.csc_team,
          }),
        onRemove: handleRemove,
      }),
    [openAssign, handleRemove],
  );

  return (
    <div className="space-y-6">
      {/* Team totals. Read-only: the Team filter in the toolbar below is what
          narrows the table, and duplicating that as a click here would leave
          two controls disagreeing about what is currently filtered. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {teams.map((team) => (
          <div key={team} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{team}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {counts.byTeam.get(team) ?? 0}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground text-sm font-medium">{UNASSIGNED}</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.unassigned}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={members}
        searchableColumns={[{ id: "full_name", title: "name" }]}
        filterableColumns={filterableColumns}
        toolbar={(table) => {
          tableRef.current = table;
          const selected = table.getFilteredSelectedRowModel().rows.length;
          return (
            <>
              {selected > 0 && (
                <span className="text-muted-foreground text-sm">
                  {selected} selected
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={selected === 0}
                onClick={() => openBulkAssign(table)}
              >
                <UsersRound className="h-4 w-4" />
                Assign to team
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={teams.length === 0}
                onClick={() => {
                  setRenameFrom("");
                  setRenameTo("");
                  setRenameOpen(true);
                }}
              >
                <PencilLine className="h-4 w-4" />
                Rename team
              </Button>
            </>
          );
        }}
      />

      {/* Assign / change team */}
      <Dialog
        open={assignTarget !== null}
        onOpenChange={(open) => !open && setAssignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to a CSC team</DialogTitle>
            <DialogDescription>{assignTarget?.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csc-team">Team</Label>
              <Select value={teamChoice} onValueChange={(v) => setTeamChoice(v ?? NONE)}>
                <SelectTrigger id="csc-team">
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_TEAM}>New team…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {teamChoice === NEW_TEAM && (
              <div className="space-y-2">
                <Label htmlFor="csc-new-team">New team name</Label>
                <Input
                  id="csc-new-team"
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  placeholder="e.g. Group 9 - Green Turtles"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename a team everywhere it appears */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename a CSC team</DialogTitle>
            <DialogDescription>
              Renames the team on every person who carries it, across Plantilla,
              Job Order and COS. Renaming into a team that already exists merges
              the two.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csc-rename-from">Team</Label>
              <Select value={renameFrom} onValueChange={(v) => setRenameFrom(v ?? "")}>
                <SelectTrigger id="csc-rename-from">
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t} ({counts.byTeam.get(t) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="csc-rename-to">New name</Label>
              <Input
                id="csc-rename-to"
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                placeholder="e.g. Group 1 - White Rhinos"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
