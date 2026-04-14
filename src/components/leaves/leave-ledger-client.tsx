"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ExportCsvButton } from "@/components/tables/export-csv-button";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

interface LeaveLedgerClientProps {
  employees: EmployeeWithRelations[];
  selectedEmployeeId: string | null;
  year: number;
  ledgerData: {
    id: string;
    leave_type: string;
    leave_code: string;
    start_date: string;
    end_date: string;
    days_applied: number;
    status: string;
    created_at: string;
  }[];
}

export function LeaveLedgerClient({
  employees,
  selectedEmployeeId,
  year,
  ledgerData,
}: LeaveLedgerClientProps) {
  const router = useRouter();
  const [empOpen, setEmpOpen] = useState(false);
  const [empId, setEmpId] = useState(selectedEmployeeId ?? "");
  const [selectedYear, setSelectedYear] = useState(String(year));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const handleFilter = () => {
    if (!empId) return;
    router.push(`/reports/leave-ledger?employee_id=${empId}&year=${selectedYear}`);
  };

  const selectedEmp = employees.find((e) => e.id === empId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2 flex-1 min-w-[250px]">
            <Label>Employee</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                render={<Button variant="outline" role="combobox" className="w-full justify-between" />}
              >
                {selectedEmp
                  ? `${selectedEmp.last_name}, ${selectedEmp.first_name} (${selectedEmp.employee_no})`
                  : "Select employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name or no..." />
                  <CommandList>
                    <CommandEmpty>No employees found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name} ${emp.employee_no}`}
                          onSelect={() => {
                            setEmpId(emp.id);
                            setEmpOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", empId === emp.id ? "opacity-100" : "opacity-0")} />
                          <div>
                            <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
                            <p className="text-xs text-muted-foreground">{emp.employee_no}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2 w-[120px]">
            <Label>Year</Label>
            <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v ?? String(new Date().getFullYear()))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleFilter} disabled={!empId}>
            View Ledger
          </Button>

          {ledgerData.length > 0 && (
            <ExportCsvButton
              data={ledgerData}
              filename={`leave-ledger-${selectedEmp?.employee_no ?? "emp"}-${selectedYear}`}
              columns={[
                { key: "leave_type", header: "Leave Type" },
                { key: "leave_code", header: "Code" },
                { key: "start_date", header: "Start Date" },
                { key: "end_date", header: "End Date" },
                { key: "days_applied", header: "Days" },
                { key: "status", header: "Status" },
                { key: "created_at", header: "Filed On" },
              ]}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
