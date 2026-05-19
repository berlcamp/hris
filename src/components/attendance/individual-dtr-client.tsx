"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { getEmployeeDtrRange } from "@/lib/actions/attendance-actions";
import { formatManilaLongDate } from "@/lib/format-date";
import { BulkDtrPdf } from "@/components/pdf/bulk-dtr-pdf";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

interface IndividualDtrClientProps {
  employees: EmployeeWithRelations[];
  isAdmin: boolean;
  currentEmployeeId: string | null;
}

function firstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function IndividualDtrClient({
  employees,
  isAdmin,
  currentEmployeeId,
}: IndividualDtrClientProps) {
  const today = useMemo(() => new Date(), []);
  const [employeeId, setEmployeeId] = useState<string>(currentEmployeeId ?? "");
  const [startDate, setStartDate] = useState<string>(firstOfMonth(today));
  const [endDate, setEndDate] = useState<string>(todayIso(today));
  const [empOpen, setEmpOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const canGenerate = employeeId && startDate && endDate && startDate <= endDate;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    try {
      const result = await getEmployeeDtrRange(employeeId, startDate, endDate);

      if (!result) {
        toast.error("Employee not found.");
        return;
      }

      const periodLabel = `${formatManilaLongDate(startDate + "T00:00:00")} - ${formatManilaLongDate(endDate + "T00:00:00")}`;

      const blob = await pdf(
        <BulkDtrPdf results={[result]} periodLabel={periodLabel} />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeLast = (result.employee.last_name || "Employee").replace(/\s+/g, "_");
      a.download = `DTR_${safeLast}_${startDate}_to_${endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("DTR PDF generated.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate DTR",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Employee
            </label>
            {isAdmin ? (
              <Popover open={empOpen} onOpenChange={setEmpOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-[280px] h-9 justify-between font-normal"
                    />
                  }
                >
                  {selectedEmployee
                    ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}`
                    : "Select employee..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search employee..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((emp) => (
                          <CommandItem
                            key={emp.id}
                            value={`${emp.last_name} ${emp.first_name}`}
                            onSelect={() => {
                              setEmployeeId(emp.id);
                              setEmpOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                employeeId === emp.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <p className="text-sm">
                              {emp.last_name}, {emp.first_name}
                            </p>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="w-[280px] h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm">
                {selectedEmployee
                  ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name}`
                  : "—"}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Date From
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[170px]"
              max={endDate || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Date To
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[170px]"
              min={startDate || undefined}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="ml-auto"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate DTR PDF
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          A CSC Form 48 DTR page will be generated for the selected employee
          and date range. Approved leaves and weekend rows are reflected
          automatically.
        </p>
      </CardContent>
    </Card>
  );
}
