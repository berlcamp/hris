"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { jobOrderPayrollColumns } from "@/components/tables/columns/job-order-payroll-columns";
import { JobOrderPayrollCreateDialog } from "./job-order-payroll-create-dialog";
import {
  JobOrderPayrollDuplicateDialog,
  type JobOrderPayrollDuplicateSource,
} from "./job-order-payroll-duplicate-dialog";
import { deleteJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import { JOB_ORDER_PAYROLL_PAGE_SIZE } from "@/lib/job-order-payroll-queries";
import { cn } from "@/lib/utils";
import type { JobOrderAreaOption, JobOrderPayroll } from "@/lib/types";

interface JobOrderPayrollListClientProps {
  payrolls: JobOrderPayroll[];
  totalCount: number;
  page: number;
  areas: JobOrderAreaOption[];
  canDelete: boolean;
}

export function JobOrderPayrollListClient({
  payrolls,
  totalCount,
  page,
  areas,
  canDelete,
}: JobOrderPayrollListClientProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // `q`/`status`/`from`/`to` are not passed as props — the page component
  // only computes `page` server-side (see page.tsx). The rest of the filter
  // bar reads its initial values straight off the URL, same idea as
  // cos-payroll-list-client's `initialFrom`/`initialTo` props but without the
  // extra prop plumbing.
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  // App Router does not remount this component on a same-route router.push,
  // so pressing Back/Forward updates `payrolls`/`totalCount`/`page` (fresh
  // server-component props) but NOT this local state — without this effect
  // the filter controls would keep showing the values from before the
  // navigation while the table underneath shows different rows. `updateUrl`
  // remains the only writer of the URL; this only ever reads from it.
  const spQ = sp.get("q") ?? "";
  const spStatus = sp.get("status") ?? "all";
  const spFrom = sp.get("from") ?? "";
  const spTo = sp.get("to") ?? "";
  useEffect(() => {
    setSearch(spQ);
    setStatus(spStatus);
    setFrom(spFrom);
    setTo(spTo);
  }, [spQ, spStatus, spFrom, spTo]);

  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] =
    useState<JobOrderPayrollDuplicateSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobOrderPayroll | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / JOB_ORDER_PAYROLL_PAGE_SIZE),
  );

  // Every filter/page change round-trips through the URL — this list is
  // server-paginated (getJobOrderPayrolls) starting at ~805 rows, so there is
  // no in-memory row set to filter against.
  const updateUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`/job-orders/payroll?${params.toString()}`));
  };

  const applySearch = () => updateUrl({ q: search || undefined, page: "1" });

  const onStatusChange = (value: string | null) => {
    if (!value) return;
    setStatus(value);
    updateUrl({ status: value === "all" ? undefined : value, page: "1" });
  };

  const applyPeriod = () =>
    updateUrl({ from: from || undefined, to: to || undefined, page: "1" });

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
    updateUrl({ q: undefined, status: undefined, from: undefined, to: undefined, page: "1" });
  };

  const filtersActive =
    !!sp.get("q") || !!sp.get("status") || !!sp.get("from") || !!sp.get("to");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteJobOrderPayroll(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payroll deleted.");
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error(
        "Something went wrong deleting this payroll. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns = jobOrderPayrollColumns({
    onView: (p) => router.push(`/job-orders/payroll/${p.id}`),
    onDuplicate: (p) => setDuplicateSource(p),
    onDelete: (p) => setDeleteTarget(p),
    canDelete,
  });

  // No getSortedRowModel: this list is server-paginated, so sorting the 20 rows
  // currently in the browser would reorder a page rather than the result set —
  // misleading, not useful. No column advertises a sort control either.
  const table = useReactTable({
    data: payrolls,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            placeholder="Search description, particulars, areas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="h-8 w-[220px]"
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={status}
          items={[
            { value: "all", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "finalized", label: "Finalized" },
          ]}
          onValueChange={onStatusChange}
        >
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="finalized">Finalized</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[150px]"
            aria-label="Period from"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[150px]"
            aria-label="Period to"
          />
          <Button variant="outline" size="sm" onClick={applyPeriod}>
            Apply
          </Button>
        </div>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset
          </Button>
        )}

        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New payroll
        </Button>
      </div>

      {/* Every filter/page change is a server round-trip, so without this the
          table just sits on stale rows and then swaps — dim it and show a
          spinner for the duration instead. aria-busy so it is not a purely
          visual cue. */}
      <div className="relative rounded-md border">
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            <span className="sr-only">Loading payrolls</span>
          </div>
        )}
        <Table
          aria-busy={isPending}
          className={cn(isPending && "opacity-60")}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
                  No payrolls found.
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

      <JobOrderPayrollCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        areas={areas}
      />

      <JobOrderPayrollDuplicateDialog
        source={duplicateSource}
        onOpenChange={(o) => {
          if (!o) setDuplicateSource(null);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job Order Payroll</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payroll? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
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
