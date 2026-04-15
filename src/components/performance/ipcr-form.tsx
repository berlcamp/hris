"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { createIpcrRecord } from "@/lib/actions/ipcr-actions";
import { getAdjectivalRating, getRatingColor } from "@/lib/ipcr-utils";
import type { EmployeeWithRelations } from "@/lib/actions/employee-actions";
import type { IpcrPeriodRow } from "@/lib/actions/ipcr-actions";

interface IpcrFormProps {
  employees: EmployeeWithRelations[];
  activePeriod: IpcrPeriodRow;
}

export function IpcrForm({ employees, activePeriod }: IpcrFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [ratingStr, setRatingStr] = useState("");
  const [remarks, setRemarks] = useState("");
  const [empOpen, setEmpOpen] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const numericalRating = ratingStr ? parseFloat(ratingStr) : null;
  const adjectival =
    numericalRating !== null && !isNaN(numericalRating)
      ? getAdjectivalRating(numericalRating)
      : null;
  const ratingColorClass = getRatingColor(adjectival);

  const isValidRating =
    numericalRating !== null &&
    !isNaN(numericalRating) &&
    numericalRating >= 1 &&
    numericalRating <= 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error("Please select an employee");
      return;
    }

    setLoading(true);
    try {
      const result = await createIpcrRecord({
        employee_id: employeeId,
        period_id: activePeriod.id,
        numerical_rating: isValidRating ? numericalRating! : undefined,
        remarks: remarks || undefined,
      });

      if (result && "error" in result) {
        toast.error(result.error);
      } else if (result && "id" in result) {
        toast.success("IPCR record created");
        router.push(`/performance/${result.id}`);
      }
    } catch {
      toast.error("Failed to create IPCR record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>IPCR Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Period info */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              Evaluation Period
            </p>
            <p className="text-sm font-medium">{activePeriod.name}</p>
          </div>

          {/* Employee Selector */}
          <div className="space-y-2">
            <Label>Employee</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  />
                }
              >
                {selectedEmployee
                  ? `${selectedEmployee.last_name}, ${selectedEmployee.first_name} (${selectedEmployee.employee_no})`
                  : "Select employee..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.last_name} ${emp.first_name} ${emp.employee_no}`}
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
                                : "opacity-0"
                            )}
                          />
                          <div>
                            <p className="text-sm font-medium">
                              {emp.last_name}, {emp.first_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.employee_no} •{" "}
                              {emp.departments?.name ?? "No Dept"}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Numerical Rating */}
          <div className="space-y-2">
            <Label>Numerical Rating (1.00 - 5.00)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.01"
                min="1"
                max="5"
                value={ratingStr}
                onChange={(e) => setRatingStr(e.target.value)}
                placeholder="e.g., 4.25"
                className="w-32"
              />
              {adjectival && (
                <Badge
                  variant="outline"
                  className={`text-sm ${ratingColorClass}`}
                >
                  {adjectival}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to fill in later (record will be saved as draft)
            </p>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label>Remarks (optional)</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/performance")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !employeeId}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Record
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
