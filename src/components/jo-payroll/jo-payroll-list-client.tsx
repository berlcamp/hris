"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  Hammer,
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
import {
  deleteJoPayroll,
  getJoPayrollById,
  type JoPayrollListRow,
  type JoEmployeeForPayroll,
} from "@/lib/actions/jo-payroll-actions";
import { JoPayrollAddModal } from "./jo-payroll-add-modal";
import { JoPayrollEditModal } from "./jo-payroll-edit-modal";
import { JoPayrollDetailModal } from "./jo-payroll-detail-modal";
import { JoPayrollDuplicateModal } from "./jo-payroll-duplicate-modal";
import {
  generateJoPayrollPrint,
  generateJoPayrollNoSssPrint,
  generateJoPayrollByDeptPrint,
  generateJoPayrollSummaryPrint,
  generateJoPayrollNoAtmPrint,
  generateJoPayrollOvertimePrint,
  generateJoPayrollOvertimeNoAtmPrint,
  generateJoPayrollSummaryOvertimePrint,
  generateJoPayrollObrPrint,
  generateJoPayrollObrOvertimePrint,
  type JoPayrollPrintRow,
} from "@/lib/pdf/generateJoPayroll";

const PER_PAGE = 10;

function formatPHP(n: number): string {
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatPeriod(start: string, end: string): string {
  return `${format(new Date(start), "MMM d, yyyy")} – ${format(
    new Date(end),
    "MMM d, yyyy",
  )}`;
}

interface Props {
  initialRows: JoPayrollListRow[];
  initialTotalCount: number;
  initialPage: number;
  initialFrom: string;
  initialTo: string;
  isSuperAdmin: boolean;
  joEmployees: JoEmployeeForPayroll[];
}

export function JoPayrollListClient({
  initialRows,
  initialTotalCount,
  initialPage,
  initialFrom,
  initialTo,
  isSuperAdmin,
  joEmployees,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JoPayrollListRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<JoPayrollListRow | null>(null);
  const [dupTarget, setDupTarget] = useState<JoPayrollListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JoPayrollListRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(initialTotalCount / PER_PAGE));

  const updateUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() =>
      router.push(`/jo-payroll?${params.toString()}`),
    );
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
    const res = await deleteJoPayroll(deleteTarget.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Payroll deleted");
      router.refresh();
    }
    setDeleteTarget(null);
  };

  const fetchPrintRows = async (
    row: JoPayrollListRow,
  ): Promise<JoPayrollPrintRow[]> => {
    const { members } = await getJoPayrollById(row.id);
    return members.map((m) => ({
      fullname: m.employees
        ? `${m.employees.last_name}, ${m.employees.first_name}${m.employees.middle_name ? " " + m.employees.middle_name : ""}`
        : "",
      area_assigned: m.employees?.area_assigned ?? null,
      rate: m.rate != null ? Number(m.rate) : m.employees?.daily_rate != null ? Number(m.employees.daily_rate) : null,
      days: m.days != null ? Number(m.days) : null,
      hours: m.hours != null ? Number(m.hours) : null,
      sss_no: m.employees?.sss_no ?? null,
      sss_ss: m.employees?.sss_ss != null ? Number(m.employees.sss_ss) : null,
      sss_ec: m.employees?.sss_ec != null ? Number(m.employees.sss_ec) : null,
      account_number: m.employees?.account_number ?? null,
      tax_number: m.employees?.tin_number ?? null,
      tax_date: null,
      tax_issued: null,
    }));
  };

  const runPrint = async (
    row: JoPayrollListRow,
    fn: (rows: JoPayrollPrintRow[], periodStart: string, periodEnd: string, areas: string | null, particulars: string | null, description: string | null) => void,
  ) => {
    try {
      const rows = await fetchPrintRows(row);
      if (rows.length === 0) {
        toast.error("No employees in this payroll");
        return;
      }
      fn(rows, row.period_start, row.period_end, row.areas, row.particulars, row.description);
    } catch (err) {
      console.error(err);
      toast.error("Print failed");
    }
  };

  const printers: Array<{
    label: string;
    fn: (
      rows: JoPayrollPrintRow[],
      periodStart: string,
      periodEnd: string,
      areas: string | null,
      particulars: string | null,
      description: string | null,
    ) => void;
  }> = [
    {
      label: "Payroll (with SSS)",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Payroll (no SSS)",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollNoSssPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "By Department",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollByDeptPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Summary",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollSummaryPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Cash Payable (no ATM)",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollNoAtmPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Overtime",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollOvertimePrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Overtime (no ATM)",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollOvertimeNoAtmPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "Summary + Overtime",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollSummaryOvertimePrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "OBR",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollObrPrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
    {
      label: "OBR + Overtime",
      fn: (rows, ps, pe, areas, particulars, description) =>
        generateJoPayrollObrOvertimePrint({ rows, periodStart: ps, periodEnd: pe, areas, particulars, description }),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hammer className="h-6 w-6" />
            Job Order Payroll
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Daily-wage Job Order payroll. Gross = rate × days; overtime = (rate
            ÷ 8) × hours; net subtracts SSS (SS+EC).
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
                <Button size="sm" className="ml-auto" onClick={applyFilter}>
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
                <TableHead>Description</TableHead>
                <TableHead>Areas</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Total</TableHead>
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
                    No JO payroll records yet.
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
                      className="max-w-[220px] truncate"
                      title={row.description ?? ""}
                    >
                      {row.description ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate"
                      title={row.areas ?? ""}
                    >
                      {row.areas ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.days ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.member_count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatPHP(row.total_amount)}
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
                            <Eye className="h-4 w-4" /> View / Edit Members
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTarget(row)}>
                            <Pencil className="h-4 w-4" /> Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDupTarget(row)}>
                            <Copy className="h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Printer className="h-4 w-4" /> Print
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {printers.map((p) => (
                                <DropdownMenuItem
                                  key={p.label}
                                  onClick={() => runPrint(row, p.fn)}
                                >
                                  {p.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
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

      <JoPayrollAddModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        joEmployees={joEmployees}
        onSuccess={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      <JoPayrollEditModal
        editData={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          router.refresh();
        }}
      />

      <JoPayrollDetailModal
        payroll={detailTarget}
        joEmployees={joEmployees}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onChange={() => router.refresh()}
      />

      <JoPayrollDuplicateModal
        source={dupTarget}
        onOpenChange={(o) => !o && setDupTarget(null)}
        onSuccess={() => {
          setDupTarget(null);
          router.refresh();
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete JO payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the payroll record and all members. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
