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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createNosa } from "@/lib/actions/nosa-actions";
import { getSalaryAmount } from "@/lib/actions/nosi-actions";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";

interface NosaFormProps {
  employees: EmployeeWithRelations[];
}

const reasonOptions = [
  { value: "promotion", label: "Promotion" },
  { value: "reclassification", label: "Reclassification" },
  { value: "salary_standardization", label: "Salary Standardization" },
  { value: "adjustment", label: "Adjustment" },
];

export function NosaForm({ employees }: NosaFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeWithRelations | null>(null);

  const [reason, setReason] = useState<string>("");
  const [legalBasis, setLegalBasis] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [newSalaryGrade, setNewSalaryGrade] = useState<number>(1);
  const [newStep, setNewStep] = useState<number>(1);
  const [remarks, setRemarks] = useState("");

  const [prevSalary, setPrevSalary] = useState(0);
  const [newSalary, setNewSalary] = useState(0);

  useEffect(() => {
    if (!selectedEmp) return;
    getSalaryAmount(selectedEmp.salary_grade, selectedEmp.step_increment).then(setPrevSalary);
  }, [selectedEmp]);

  useEffect(() => {
    if (newSalaryGrade && newStep) {
      getSalaryAmount(newSalaryGrade, newStep).then(setNewSalary);
    }
  }, [newSalaryGrade, newStep]);

  const handleSelectEmployee = (emp: EmployeeWithRelations) => {
    setSelectedEmp(emp);
    setNewSalaryGrade(emp.salary_grade);
    setNewStep(emp.step_increment);
    setEmpOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !effectiveDate || !reason) {
      toast.error("Please fill all required fields.");
      return;
    }
    setLoading(true);
    const result = await createNosa({
      employee_id: selectedEmp.id,
      previous_salary_grade: selectedEmp.salary_grade,
      previous_step: selectedEmp.step_increment,
      previous_salary: prevSalary,
      new_salary_grade: newSalaryGrade,
      new_step: newStep,
      new_salary: newSalary,
      reason,
      effective_date: effectiveDate,
      legal_basis: legalBasis || null,
      remarks: remarks || null,
    });
    if ("error" in result) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success("NOSA draft created successfully.");
    router.push(`/nosa/${result.data?.id}`);
  };

  const formatPHP = (n: number) =>
    n > 0 ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Employee Selection</CardTitle></CardHeader>
        <CardContent>
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
                          <Check className={cn("mr-2 h-4 w-4", selectedEmp?.id === emp.id ? "opacity-100" : "opacity-0")} />
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
        <>
          <Card>
            <CardHeader><CardTitle>Salary Adjustment Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Previous SG</Label>
                  <Input value={selectedEmp.salary_grade} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Previous Step</Label>
                  <Input value={selectedEmp.step_increment} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Previous Salary</Label>
                  <Input value={formatPHP(prevSalary)} disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Salary Grade *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={33}
                    value={newSalaryGrade}
                    onChange={(e) => setNewSalaryGrade(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Step *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={newStep}
                    onChange={(e) => setNewStep(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>New Salary</Label>
                  <Input value={formatPHP(newSalary)} disabled className="font-semibold text-green-700" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason *</Label>
                <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Legal Basis</Label>
                <Textarea
                  value={legalBasis}
                  onChange={(e) => setLegalBasis(e.target.value)}
                  placeholder='e.g., "SSL Tranche 5", "SB Resolution No. 123"'
                  rows={2}
                />
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
        </>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !selectedEmp || !effectiveDate || !reason}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save as Draft
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/nosa")}>Cancel</Button>
      </div>
    </form>
  );
}
