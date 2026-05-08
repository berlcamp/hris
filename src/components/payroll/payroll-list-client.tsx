"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  CircleDollarSign,
  Plus,
  Filter,
  MoreHorizontal,
  Pencil,
  Copy,
  Printer,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import {
  deletePayroll,
  type PayrollListRow,
} from "@/lib/actions/payroll-actions";
import { PayrollMetadataModal } from "./payroll-metadata-modal";
import { PayrollDetailModal } from "./payroll-detail-modal";
import { PayrollDuplicateModal } from "./payroll-duplicate-modal";
import { PayrollPrintMenu } from "./payroll-print-menu";

interface Props {
  initialRows: PayrollListRow[];
  initialTotalCount: number;
  initialPage: number;
  initialFrom: string;
  initialTo: string;
  isSuperAdmin: boolean;
}

const PER_PAGE = 10;

function formatPHP(n: number): string {
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatPeriod(start: string, end: string): string {
  return `${format(new Date(start), "MMM d, yyyy")} - ${format(
    new Date(end),
    "MMM d, yyyy",
  )}`;
}

export function PayrollListClient({
  initialRows,
  initialTotalCount,
  initialPage,
  initialFrom,
  initialTo,
  isSuperAdmin,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PayrollListRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<PayrollListRow | null>(null);
  const [dupTarget, setDupTarget] = useState<PayrollListRow | null>(null);
  const [printTarget, setPrintTarget] = useState<PayrollListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollListRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(initialTotalCount / PER_PAGE));

  const updateUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`/payroll?${params.toString()}`));
  };

  const applyFilter = () => {
    updateUrl({ from: from || undefined, to: to || undefined, page: "1" });
  };

  const clearFilter = () => {
    setFrom("");
    setTo("");
    updateUrl({ from: undefined, to: undefined, page: "1" });
  };

  const filterCount = (from ? 1 : 0) + (to ? 1 : 0);

  const onDelete = async () => {
    if (!deleteTarget) return;
    const res = await deletePayroll(deleteTarget.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Payroll deleted");
      router.refresh();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CircleDollarSign className="h-6 w-6" />
            Payroll
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Regular plantilla payroll runs. Each period stores per-employee
            deductions and is split into 1st and 2nd half remittances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4" />
                  Filter
                  {filterCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {filterCount}
                    </Badge>
                  )}
                </Button>
              }
            />
            <PopoverContent className="w-80 space-y-3" align="end">
              <div className="space-y-1">
                <label className="text-xs font-medium">Period from</label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Period to</label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="flex justify-between gap-2">
                {filterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilter}>
                    Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={applyFilter}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Payroll
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Particulars (1st)</TableHead>
                <TableHead>Particulars (2nd)</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">1st Half Total</TableHead>
                <TableHead className="text-right">2nd Half Total</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No payroll records yet.
                  </TableCell>
                </TableRow>
              ) : (
                initialRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium text-primary hover:underline"
                        onClick={() => setDetailTarget(row)}
                      >
                        {formatPeriod(row.period_start, row.period_end)}
                      </button>
                    </TableCell>
                    <TableCell
                      className="max-w-[260px] truncate"
                      title={row.particulars ?? ""}
                    >
                      {row.particulars ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[260px] truncate"
                      title={row.particulars_2nd_half ?? ""}
                    >
                      {row.particulars_2nd_half ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.employee_count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatPHP(row.total_amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatPHP(row.total_amount_2nd_half)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailTarget(row)}>
                            <Eye className="h-4 w-4" /> View / Edit Employees
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTarget(row)}>
                            <Pencil className="h-4 w-4" /> Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDupTarget(row)}>
                            <Copy className="h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPrintTarget(row)}>
                            <Printer className="h-4 w-4" /> Print…
                          </DropdownMenuItem>
                          {isSuperAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {initialPage} of {totalPages} · {initialTotalCount} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={initialPage <= 1}
              onClick={() => updateUrl({ page: String(initialPage - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={initialPage >= totalPages}
              onClick={() => updateUrl({ page: String(initialPage + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <PayrollMetadataModal
        open={createOpen || !!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        editData={editTarget}
        onSuccess={() => router.refresh()}
      />

      <PayrollDetailModal
        payroll={detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onChange={() => router.refresh()}
      />

      <PayrollDuplicateModal
        source={dupTarget}
        onOpenChange={(o) => !o && setDupTarget(null)}
        onSuccess={() => {
          setDupTarget(null);
          router.refresh();
        }}
      />

      <PayrollPrintMenu
        payroll={printTarget}
        onOpenChange={(o) => !o && setPrintTarget(null)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the payroll record and all employee
              entries within it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className={cn("bg-destructive text-destructive-foreground")}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
