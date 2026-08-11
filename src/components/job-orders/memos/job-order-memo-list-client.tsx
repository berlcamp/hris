"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { jobOrderMemoColumns } from "@/components/tables/columns/job-order-memo-columns";
import { JobOrderMemoFormDialog } from "./job-order-memo-form-dialog";
import {
  JobOrderMemoDuplicateDialog,
  type JobOrderMemoDuplicateSource,
} from "./job-order-memo-duplicate-dialog";
import { deleteJobOrderMemo } from "@/lib/actions/job-order-memo-actions";
import { cn } from "@/lib/utils";
import type { JobOrderMemo } from "@/lib/types";

/** Typed verbatim (case-sensitive) before Delete unlocks. */
const DELETE_CONFIRM_PHRASE = "DELETE";

interface JobOrderMemoListClientProps {
  memos: JobOrderMemo[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
}

export function JobOrderMemoListClient({
  memos,
  totalCount,
  page,
  pageSize,
  canEdit,
}: JobOrderMemoListClientProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "all");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  // App Router does not remount this component on a same-route router.push,
  // so Back/Forward updates the server props but NOT this local state —
  // without this effect the filter bar would keep showing pre-navigation
  // values while the table shows different rows.
  const spQ = sp.get("q") ?? "";
  const spType = sp.get("type") ?? "all";
  const spFrom = sp.get("from") ?? "";
  const spTo = sp.get("to") ?? "";
  useEffect(() => {
    setSearch(spQ);
    setType(spType);
    setFrom(spFrom);
    setTo(spTo);
  }, [spQ, spType, spFrom, spTo]);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JobOrderMemo | null>(null);
  const [duplicateSource, setDuplicateSource] =
    useState<JobOrderMemoDuplicateSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobOrderMemo | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteUnlocked = deleteConfirmText === DELETE_CONFIRM_PHRASE;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Every filter/page change round-trips through the URL — this list is
  // server-paginated, so there is no in-memory row set to filter against.
  const updateUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`/job-orders/memos?${params.toString()}`));
  };

  const applySearch = () => updateUrl({ q: search || undefined, page: "1" });

  const onTypeChange = (value: string | null) => {
    if (!value) return;
    setType(value);
    updateUrl({ type: value === "all" ? undefined : value, page: "1" });
  };

  const applyDates = () =>
    updateUrl({ from: from || undefined, to: to || undefined, page: "1" });

  const clearFilters = () => {
    setSearch("");
    setType("all");
    setFrom("");
    setTo("");
    updateUrl({
      q: undefined,
      type: undefined,
      from: undefined,
      to: undefined,
      page: "1",
    });
  };

  const filtersActive =
    !!sp.get("q") || !!sp.get("type") || !!sp.get("from") || !!sp.get("to");

  const handleDelete = async () => {
    if (!deleteTarget || !deleteUnlocked) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderMemo(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Memo deleted.");
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong deleting this memo. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const columns = jobOrderMemoColumns({
    onView: (m) => router.push(`/job-orders/memos/${m.id}`),
    onEdit: (m) => {
      setEditTarget(m);
      setFormOpen(true);
    },
    onDuplicate: (m) => setDuplicateSource(m),
    onDelete: (m) => setDeleteTarget(m),
    canEdit,
  });

  // No getSortedRowModel: the list is server-paginated, so sorting the rows
  // currently in the browser would reorder a page, not the result set.
  const table = useReactTable({
    data: memos,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            placeholder="Search subject, memo no., period…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="h-8 w-[240px]"
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={type}
          items={[
            { value: "all", label: "All types" },
            { value: "new", label: "New" },
            { value: "retain", label: "Retain" },
          ]}
          onValueChange={onTypeChange}
        >
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="retain">Retain</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[150px]"
            aria-label="Date from"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[150px]"
            aria-label="Date to"
          />
          <Button variant="outline" size="sm" onClick={applyDates}>
            Apply
          </Button>
        </div>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset
          </Button>
        )}

        {canEdit && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New memo
          </Button>
        )}
      </div>

      {/* Every filter/page change is a server round-trip, so dim the table and
          show a spinner rather than sitting on stale rows that then swap.
          aria-busy so it is not a purely visual cue. */}
      <div className="relative rounded-md border">
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            <span className="sr-only">Loading memos</span>
          </div>
        )}
        <Table aria-busy={isPending} className={cn(isPending && "opacity-60")}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No memos found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages} · {totalCount} total
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => updateUrl({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => updateUrl({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>

      <JobOrderMemoFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditTarget(null);
        }}
        memo={editTarget}
      />

      <JobOrderMemoDuplicateDialog
        source={duplicateSource}
        onOpenChange={(o) => {
          if (!o) setDuplicateSource(null);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
          // Clear on every open/close so a previously-typed confirmation can
          // never carry over and pre-unlock the next row's delete.
          setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memorandum</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the memo and all {deleteTarget?.member_count ?? 0} of
              its listed employees. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-memo-list">
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm-memo-list"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              autoComplete="off"
              disabled={deleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !deleteUnlocked}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
