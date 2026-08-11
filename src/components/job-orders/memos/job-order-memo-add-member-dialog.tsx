"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  addJobOrderMemoMembers,
  getAddableJobOrdersForMemo,
} from "@/lib/actions/job-order-memo-actions";
import type { JobOrderMemoPickerOption } from "@/lib/types";

interface JobOrderMemoAddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoId: string;
  onAdded: () => void;
}

export function JobOrderMemoAddMemberDialog({
  open,
  onOpenChange,
  memoId,
  onAdded,
}: JobOrderMemoAddMemberDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<JobOrderMemoPickerOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  // Reload the addable list every time the dialog opens, so somebody added in
  // another tab (or a moment ago here) isn't offered twice.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected([]);
    setLoading(true);
    getAddableJobOrdersForMemo(memoId)
      .then(setOptions)
      .catch(() => {
        toast.error("Failed to load addable Job Order employees.");
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [open, memoId]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? options.filter((o) =>
        `${o.full_name} ${o.area_name ?? ""}`.toLowerCase().includes(term),
      )
    : options;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selected.includes(o.id));

  const toggleAllFiltered = (checked: boolean) => {
    const next = new Set(selected);
    for (const o of filtered) {
      if (checked) next.add(o.id);
      else next.delete(o.id);
    }
    setSelected([...next]);
  };

  const handleAdd = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const result = await addJobOrderMemoMembers(memoId, selected);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.data!.added} ${result.data!.added === 1 ? "employee" : "employees"} added.`,
      );
      onOpenChange(false);
      onAdded();
    } catch {
      toast.error("Something went wrong adding these employees. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employees</DialogTitle>
          <DialogDescription>
            Active Job Order employees not already listed on this memo.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search name or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="rounded-md border">
          <label className="flex items-center gap-2 border-b p-2 text-sm">
            <Checkbox
              checked={allFilteredSelected}
              disabled={filtered.length === 0}
              onCheckedChange={(c) => toggleAllFiltered(!!c)}
            />
            <span>
              Select all{term ? " matching" : ""} ({filtered.length})
            </span>
          </label>
          <ScrollArea className="h-72">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No matching employees.
              </p>
            ) : (
              <div className="space-y-1 p-2">
                {filtered.map((o) => (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={selected.includes(o.id)}
                      onCheckedChange={(c) =>
                        setSelected((prev) =>
                          c ? [...prev, o.id] : prev.filter((v) => v !== o.id),
                        )
                      }
                    />
                    <span className="flex-1">{o.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.area_name ?? "—"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={saving || selected.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add {selected.length > 0 ? selected.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
