"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  addJobOrderPayrollMember,
  getAddableJobOrders,
} from "@/lib/actions/job-order-payroll-member-actions";
import type { JobOrderEmployee } from "@/lib/types";

interface JobOrderPayrollAddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrollId: string;
  onAdded: () => void;
}

export function JobOrderPayrollAddMemberDialog({
  open,
  onOpenChange,
  payrollId,
  onAdded,
}: JobOrderPayrollAddMemberDialogProps) {
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<JobOrderEmployee[]>([]);

  // Reload the addable list every time the dialog opens, so a member added in
  // another tab/session (or this same session a moment ago) isn't offered
  // twice.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    getAddableJobOrders(payrollId)
      .then((rows) => setOptions(rows))
      .catch(() => {
        toast.error("Failed to load addable Job Order employees.");
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [open, payrollId]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? options.filter((o) =>
        `${o.full_name} ${o.area_name ?? ""} ${o.sub_area ?? ""}`
          .toLowerCase()
          .includes(term),
      )
    : options;

  const handleAdd = async (jo: JobOrderEmployee) => {
    setAddingId(jo.id);
    try {
      const result = await addJobOrderPayrollMember(payrollId, jo.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${jo.full_name} added.`);
      setOptions((prev) => prev.filter((o) => o.id !== jo.id));
      onAdded();
    } catch {
      toast.error("Something went wrong adding this member. Please try again.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Active Job Order employees not already on this payroll.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search name or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <ScrollArea className="h-72 rounded-md border">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No matching employees.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((jo) => (
                <div
                  key={jo.id}
                  className="flex items-center justify-between gap-2 p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{jo.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {jo.area_name ?? "—"}
                      {jo.sub_area ? ` · ${jo.sub_area}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addingId === jo.id}
                    onClick={() => handleAdd(jo)}
                  >
                    {addingId === jo.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
