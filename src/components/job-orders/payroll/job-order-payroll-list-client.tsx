"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
import { deleteJobOrderPayroll } from "@/lib/actions/job-order-payroll-actions";
import type { JobOrderAreaOption, JobOrderPayroll } from "@/lib/types";

const PAGE_SIZE = 20;

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
  const [, startTransition] = useTransition();

  // `q`/`status`/`from`/`to` are not passed as props — the page component
  // only computes `page` server-side (see page.tsx). The rest of the filter
  // bar reads its initial values straight off the URL, same idea as
  // cos-payroll-list-client's `initialFrom`/`initialTo` props but without the
  // extra prop plumbing.
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JobOrderPayroll | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
    } finally {
      setDeleting(false);
    }
  };

  const columns = jobOrderPayrollColumns({
    onView: (p) => router.push(`/job-orders/payroll/${p.id}`),
    // Duplicating a payroll (duplicateJobOrderPayroll) needs its own
    // period/metadata form, same shape as CosPayrollDuplicateModal. That's
    // out of scope here — Task 7 only wires getJobOrderPayrolls,
    // getJobOrderAreasForPicker, createJobOrderPayroll and
    // deleteJobOrderPayroll. Point the user at the detail page instead of
    // leaving the menu item silently dead.
    onDuplicate: () =>
      toast.info("Duplicate a payroll from its detail page."),
    onDelete: (p) => setDeleteTarget(p),
    canDelete,
  });

  const table = useReactTable({
    data: payrolls,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

        <Select value={status} onValueChange={onStatusChange}>
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

      <div className="rounded-md border">
        <Table>
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
            disabled={page <= 1}
            onClick={() => updateUrl({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
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
