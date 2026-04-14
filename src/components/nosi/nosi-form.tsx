"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createNosi, getSalaryAmount } from "@/lib/actions/nosi-actions";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

interface NosiFormProps {
  employees: EmployeeWithRelations[];
  preselectedEmployeeId: string | null;
  preselectedEmployee: EmployeeWithRelations | null;
}

export function NosiForm({ employees, preselectedEmployeeId, preselectedEmployee }: NosiFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(preselectedEmployeeId);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeWithRelations | null>(preselectedEmployee);
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [dateOpen, setDateOpen] = useState(false);
  const [currentSalary, setCurrentSalary] = useState(0);
  const [newSalary, setNewSalary] = useState(0);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!selectedEmp) return;
    const fetchSalaries = async () => {
      const [cur, nxt] = await Promise.all([
        getSalaryAmount(selectedEmp.salary_grade, selectedEmp.step_increment),
        getSalaryAmount(selectedEmp.salary_grade, selectedEmp.step_increment + 1),
      ]);
      setCurrentSalary(cur);
      setNewSalary(nxt);
    };
    fetchSalaries();
  }, [selectedEmp]);

  const handleSelectEmployee = (emp: EmployeeWithRelations) => {
    setSelectedEmpId(emp.id);
    setSelectedEmp(emp);
    setEmpOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !effectiveDate) {
      toast.error("Please select an employee and effective date.");
      return;
    }
    if (selectedEmp.step_increment >= 8) {
      toast.error("Employee is already at maximum step.");
      return;
    }
    setLoading(true);
    const result = await createNosi({
      employee_id: selectedEmp.id,
      current_salary_grade: selectedEmp.salary_grade,
      current_step: selectedEmp.step_increment,
      new_step: selectedEmp.step_increment + 1,
      current_salary: currentSalary,
      new_salary: newSalary,
      effective_date: effectiveDate,
      last_increment_date: null,
      years_in_step: null,
      remarks: remarks || null,
    });
    if ("error" in result) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success("NOSI draft created successfully.");
    router.push(`/nosi/${result.data?.id}`);
  };

  const formatPHP = (n: number) =>
    n > 0 ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Employee Selection</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                render={<Button variant="outline" role="combobox" className="w-full justify-between" />}
              >
                {selectedEmp
                  ? `${selectedEmp.last_name}, ${selectedEmp.first_name} (${selectedEmp.employee_no})`
                  : "Select an employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name or employee no..." />
                  <CommandList>
                    <CommandEmpty>No employees found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name} ${emp.employee_no}`}
                          onSelect={() => handleSelectEmployee(emp)}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedEmpId === emp.id ? "opacity-100" : "opacity-0")} />
                          <div>
                            <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
                            <p className="text-xs text-muted-foreground">{emp.employee_no} — SG {emp.salary_grade} Step {emp.step_increment}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {selectedEmp && (
        <Card>
          <CardHeader><CardTitle>Increment Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Salary Grade</Label>
                <Input value={selectedEmp.salary_grade} disabled />
              </div>
              <div className="space-y-2">
                <Label>Current Step</Label>
                <Input value={selectedEmp.step_increment} disabled />
              </div>
              <div className="space-y-2">
                <Label>New Step</Label>
                <Input value={selectedEmp.step_increment + 1} disabled className="font-semibold" />
              </div>
              <div className="space-y-2">
                <Label>Current Salary</Label>
                <Input value={formatPHP(currentSalary)} disabled />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>New Salary</Label>
                <Input value={formatPHP(newSalary)} disabled className="font-semibold text-green-700" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Effective Date *</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  render={
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !effectiveDate && "text-muted-foreground")} />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {effectiveDate ? format(new Date(effectiveDate), "MMMM d, yyyy") : "Select date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveDate ? new Date(effectiveDate) : undefined}
                    onSelect={(d) => { setEffectiveDate(d ? format(d, "yyyy-MM-dd") : ""); setDateOpen(false); }}
                    captionLayout="dropdown"
                    fromYear={2000}
                    toYear={new Date().getFullYear() + 2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional remarks..." rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !selectedEmp || !effectiveDate}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save as Draft
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/nosi")}>Cancel</Button>
      </div>
    </form>
  );
}
