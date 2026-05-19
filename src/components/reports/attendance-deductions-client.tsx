"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Send, Eye, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ReportShell } from "./report-shell";
import {
  getAttendanceDeductionsReport,
  postMonthlyAttendanceDeductions,
  previewMonthlyAttendanceDeductions,
  reverseAttendanceDeductionForMonth,
  type AttendanceDeductionPreview,
  type AttendanceDeductionRow,
} from "@/lib/actions/attendance-deduction-actions";

interface Props {
  departments: { id: string; name: string; code: string }[];
}

const ALL_DEPTS = "__all__";
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AttendanceDeductionsClient({ departments }: Props) {
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [departmentId, setDepartmentId] = useState<string>(ALL_DEPTS);
  const [data, setData] = useState<AttendanceDeductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<AttendanceDeductionPreview | null>(null);
  const [showOnlyChanges, setShowOnlyChanges] = useState(true);
  const [reverseTarget, setReverseTarget] = useState<AttendanceDeductionRow | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)),
    [now],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getAttendanceDeductionsReport(
        Number(year),
        Number(month),
        departmentId === ALL_DEPTS ? null : departmentId,
      );
      setData(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, departmentId]);

  const handleOpenPreview = async () => {
    setPreviewing(true);
    try {
      const result = await previewMonthlyAttendanceDeductions(
        Number(year),
        Number(month),
        departmentId === ALL_DEPTS ? null : departmentId,
      );
      setPreview(result);
      setShowOnlyChanges(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to preview");
    } finally {
      setPreviewing(false);
    }
  };

  const handleReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const result = await reverseAttendanceDeductionForMonth(
        reverseTarget.employee_id,
        Number(year),
        Number(month),
        reverseReason.trim() || undefined,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Reversed: posted +${result.offset.toFixed(3)} d adjustment for ${reverseTarget.employee_name}.`,
      );
      setReverseTarget(null);
      setReverseReason("");
      await loadData();
    } finally {
      setReversing(false);
    }
  };

  const handleConfirmPost = async () => {
    setPosting(true);
    try {
      const result = await postMonthlyAttendanceDeductions(
        Number(year),
        Number(month),
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.posts === 0) {
        toast.success(
          `Nothing to update for ${monthNames[Number(month) - 1]} ${year} — ledger already matches.`,
        );
      } else {
        toast.success(
          `${result.posts} delta${result.posts === 1 ? "" : "s"} posted (${result.totalDays.toFixed(3)} d) across ${result.employees} employee${result.employees === 1 ? "" : "s"}.`,
        );
      }
      setPreview(null);
      await loadData();
    } finally {
      setPosting(false);
    }
  };

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, r) => {
          acc.netDays += r.net_days;
          acc.netMins += r.net_minutes;
          acc.posts += r.post_count;
          return acc;
        },
        { netDays: 0, netMins: 0, posts: 0 },
      ),
    [data],
  );

  const toCsv = () => {
    const headers = [
      "Employee",
      "Department",
      "Net Deduction (days)",
      "Implied Deficit (mins)",
      "Posts",
      "First Posted",
      "Last Posted",
    ];
    const rows = data.map((r) =>
      [
        `"${r.employee_name.replace(/"/g, '""')}"`,
        `"${(r.department_name ?? "").replace(/"/g, '""')}"`,
        r.net_days.toFixed(3),
        r.net_minutes,
        r.post_count,
        `"${format(new Date(r.first_posted_at), "yyyy-MM-dd HH:mm")}"`,
        `"${format(new Date(r.last_posted_at), "yyyy-MM-dd HH:mm")}"`,
      ].join(","),
    );
    return [headers.join(","), ...rows].join("\n");
  };

  const fileName = `Attendance_Deductions_${year}-${month.padStart(2, "0")}.csv`;

  const visiblePreviewRows = preview
    ? showOnlyChanges
      ? preview.rows.filter((r) => r.delta_days !== 0)
      : preview.rows
    : [];

  return (
    <>
    <ReportShell
      title="Attendance Deductions"
      onExportCsv={data.length > 0 ? toCsv : undefined}
      fileName={fileName}
      filters={
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Month
            </label>
            <Select value={month} onValueChange={(v) => v && setMonth(v)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Year
            </label>
            <Select value={year} onValueChange={(v) => v && setYear(v)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Department
            </label>
            <Select
              value={departmentId}
              onValueChange={(v) => v && setDepartmentId(v)}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPTS}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleOpenPreview}
            disabled={previewing || posting}
            className="ml-auto"
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview &amp; Post Deductions for {monthNames[Number(month) - 1]} {year}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">
          {data.length} employee{data.length === 1 ? "" : "s"} with deductions
        </Badge>
        {data.length > 0 && (
          <>
            <Badge variant="outline">
              Net: {totals.netDays.toFixed(3)} d ({totals.netMins} min)
            </Badge>
            <Badge variant="outline">{totals.posts} ledger entries</Badge>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Employee</TableHead>
                <TableHead className="text-xs">Department</TableHead>
                <TableHead className="text-xs text-right">Net Deduction (d)</TableHead>
                <TableHead className="text-xs text-right">Implied Deficit (m)</TableHead>
                <TableHead className="text-xs text-center">Posts</TableHead>
                <TableHead className="text-xs">First Posted</TableHead>
                <TableHead className="text-xs">Last Posted</TableHead>
                <TableHead className="text-xs w-[1%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8 text-sm"
                  >
                    No deductions posted for {monthNames[Number(month) - 1]}{" "}
                    {year}. Click <em>Post Deductions</em> above to apply the
                    month&apos;s tardy/undertime to VL credits.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.employee_id}>
                    <TableCell className="text-xs font-medium">
                      {r.employee_name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.department_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-destructive">
                      {r.net_days.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {r.net_minutes}
                    </TableCell>
                    <TableCell className="text-xs text-center tabular-nums">
                      {r.post_count > 1 ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.post_count}
                        </Badge>
                      ) : (
                        r.post_count
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.first_posted_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.last_posted_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setReverseTarget(r);
                          setReverseReason("");
                        }}
                        title="Post an offsetting adjustment that cancels this month's deduction"
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        Reverse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ReportShell>

    <Dialog
      open={preview !== null}
      onOpenChange={(o) => {
        if (!o && !posting) setPreview(null);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Preview &mdash; {monthNames[Number(month) - 1]} {year}
          </DialogTitle>
          <DialogDescription>
            These ledger entries will be created when you confirm. Re-running
            later is safe &mdash; only differences post.
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">
                {preview.summary.candidates} candidate
                {preview.summary.candidates === 1 ? "" : "s"}
              </Badge>
              <Badge
                variant={preview.summary.changing > 0 ? "destructive" : "secondary"}
              >
                {preview.summary.changing} will change
              </Badge>
              <Badge variant="secondary">
                {preview.summary.unchanged} unchanged
              </Badge>
              {preview.summary.changing > 0 && (
                <Badge variant="outline">
                  Net delta: {preview.summary.deltaDaysTotal.toFixed(3)} d
                </Badge>
              )}
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOnlyChanges((s) => !s)}
                >
                  {showOnlyChanges ? "Show all" : "Show only changes"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[360px] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="text-xs">Employee</TableHead>
                    <TableHead className="text-xs">Department</TableHead>
                    <TableHead className="text-xs text-right">
                      Deficit (m)
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Required (d)
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Posted (d)
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Delta (d)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePreviewRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8 text-sm"
                      >
                        {preview.summary.candidates === 0
                          ? "No plantilla employees with attendance in this month."
                          : "No pending changes — ledger already matches."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiblePreviewRows.map((r) => (
                      <TableRow key={r.employee_id}>
                        <TableCell className="text-xs font-medium">
                          {r.employee_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.department_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {r.total_minutes}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {r.required_days.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                          {r.already_posted_days.toFixed(3)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right tabular-nums font-semibold ${
                            r.delta_days < 0
                              ? "text-destructive"
                              : r.delta_days > 0
                              ? "text-green-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {r.delta_days > 0 ? "+" : ""}
                          {r.delta_days.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setPreview(null)}
            disabled={posting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmPost}
            disabled={posting || (preview?.summary.changing ?? 0) === 0}
          >
            {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-1 h-4 w-4" />
            {preview && preview.summary.changing > 0
              ? `Confirm — post ${preview.summary.changing} change${preview.summary.changing === 1 ? "" : "s"}`
              : "Nothing to post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={reverseTarget !== null}
      onOpenChange={(o) => {
        if (!o && !reversing) {
          setReverseTarget(null);
          setReverseReason("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this deduction?</AlertDialogTitle>
          <AlertDialogDescription>
            Posts a positive{" "}
            <span className="font-mono font-semibold text-green-600">
              {reverseTarget ? `+${(-reverseTarget.net_days).toFixed(3)}` : ""} d
            </span>{" "}
            adjustment that cancels {reverseTarget?.employee_name}&apos;s
            deductions for {monthNames[Number(month) - 1]} {year}. The original
            deduction rows stay in the ledger as audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-xs text-muted-foreground">
          Future Preview/Post runs will still see 0 delta unless attendance is
          edited again.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="reverse-reason" className="text-xs">
            Reason (optional)
          </Label>
          <Textarea
            id="reverse-reason"
            placeholder="e.g. official business, system error, HR amnesty…"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={reversing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReverse}
            disabled={reversing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {reversing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Undo2 className="mr-1 h-4 w-4" />
            Confirm Reversal
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
