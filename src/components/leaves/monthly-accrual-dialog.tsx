"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { accrueMonthlyLeaveCredits } from "@/lib/actions/leave-accrual-actions";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function MonthlyAccrualDialog() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1].map((v) => String(v));
  }, [now]);

  const handleSubmit = async () => {
    setLoading(true);
    const result = await accrueMonthlyLeaveCredits(Number(year), Number(month));
    if ("error" in result) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    const { summary } = result;
    const detail = summary.amounts
      .map((a) => `${a.code}: +${a.per_employee}`)
      .join(", ");
    toast.success(
      `Accrued ${summary.rowsInserted} row(s) for ${MONTHS[summary.month - 1]} ${
        summary.year
      } (${detail}).` +
        (summary.rowsSkipped > 0
          ? ` ${summary.rowsSkipped} skipped (already accrued).`
          : "")
    );
    if (summary.errors.length > 0) {
      toast.message("Accrual warnings", {
        description: summary.errors.slice(0, 4).join("\n"),
      });
    }
    setOpen(false);
    setLoading(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarPlus className="h-4 w-4" />
        Run Monthly Accrual
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Monthly Leave Accrual</DialogTitle>
          <DialogDescription>
            Adds VL and SL credits (1.25 each by default, configurable in
            System Settings) to every active employee for the selected period.
            A pg_cron job runs this automatically on the 1st of every month —
            use this dialog only for backfills or one-off catch-ups.
            Already-accrued months are silently skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Year</Label>
            <Select
              value={year}
              items={yearOptions.map((y) => ({ value: y, label: y }))}
              onValueChange={(v) => setYear(v ?? String(now.getFullYear()))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y} label={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select
              value={month}
              items={MONTHS.map((m, i) => ({
                value: String(i + 1),
                label: m,
              }))}
              onValueChange={(v) => setMonth(v ?? String(now.getMonth() + 1))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)} label={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Run accrual
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
