"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  employeeFormSchema,
  type EmployeeFormValues,
} from "@/lib/validations/employee-schema";
import { createEmployee, updateEmployee } from "@/lib/actions/employee-actions";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Position {
  id: string;
  title: string;
  item_number: string | null;
  salary_grade: number;
  department_id: string | null;
}

interface Schedule {
  id: string;
  name: string;
  time_in: string;
  time_out: string;
  break_start: string | null;
  break_end: string | null;
}

interface EmployeeFormProps {
  departments: Department[];
  positions: Position[];
  schedules: Schedule[];
  defaultValues?: EmployeeFormValues & { id?: string };
  mode: "create" | "edit";
  employeeNo?: string;
}

const genderOptions = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

const civilStatusOptions = [
  { value: "Single", label: "Single" },
  { value: "Married", label: "Married" },
  { value: "Widowed", label: "Widowed" },
  { value: "Separated", label: "Separated" },
  { value: "Divorced", label: "Divorced" },
];

export function EmployeeForm({
  departments,
  positions,
  schedules,
  defaultValues,
  mode,
  employeeNo,
}: EmployeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(employeeFormSchema) as any,
    defaultValues: defaultValues ?? {
      first_name: "",
      middle_name: null,
      last_name: "",
      suffix: null,
      birth_date: null,
      gender: null,
      civil_status: null,
      address: null,
      phone: null,
      employment_type: "plantilla",
      position_id: null,
      department_id: null,
      salary_grade: 1,
      step_increment: 1,
      hire_date: "",
      end_of_contract: null,
      schedule_id: null,
    },
  });

  const watchEmploymentType = watch("employment_type");
  const watchDepartment = watch("department_id");
  const watchPosition = watch("position_id");
  const watchHireDate = watch("hire_date");
  const watchBirthDate = watch("birth_date");
  const watchEndOfContract = watch("end_of_contract");
  const watchGender = watch("gender");
  const watchCivilStatus = watch("civil_status");
  const watchScheduleId = watch("schedule_id");

  // Filter positions by selected department
  const filteredPositions = watchDepartment
    ? positions.filter((p) => p.department_id === watchDepartment)
    : positions;

  // When a position is selected, auto-fill salary grade
  const handlePositionChange = (positionId: string | null) => {
    const pid = positionId ?? "none";
    setValue("position_id", pid === "none" ? null : pid, {
      shouldValidate: true,
    });
    if (pid !== "none") {
      const position = positions.find((p) => p.id === pid);
      if (position) {
        setValue("salary_grade", position.salary_grade, {
          shouldValidate: true,
        });
      }
    }
  };

  const onSubmit = async (data: EmployeeFormValues) => {
    setLoading(true);

    const result =
      mode === "create"
        ? await createEmployee(data)
        : await updateEmployee(defaultValues!.id!, data);

    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      mode === "create"
        ? "Employee created successfully."
        : "Employee updated successfully."
    );
    router.push("/employees");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {mode === "create" && employeeNo && (
        <Card>
          <CardHeader>
            <CardTitle>Identification</CardTitle>
            <CardDescription>
              Auto-generated identifier for this employee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Employee Number</Label>
              <Input value={employeeNo} disabled />
              <p className="text-xs text-muted-foreground">
                Auto-generated upon creation.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Basic personal details of the employee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                placeholder="Juan"
                {...register("first_name")}
                aria-invalid={!!errors.first_name}
              />
              {errors.first_name && (
                <p className="text-sm text-destructive">
                  {errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                placeholder="Dela Cruz"
                {...register("last_name")}
                aria-invalid={!!errors.last_name}
              />
              {errors.last_name && (
                <p className="text-sm text-destructive">
                  {errors.last_name.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="middle_name">Middle Name</Label>
              <Input
                id="middle_name"
                placeholder="Santos"
                {...register("middle_name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suffix">Suffix</Label>
              <Input
                id="suffix"
                placeholder="Jr., Sr., III"
                {...register("suffix")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Birth Date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !watchBirthDate && "text-muted-foreground"
                      )}
                    />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {watchBirthDate
                    ? format(new Date(watchBirthDate), "MMMM d, yyyy")
                    : "Select date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      watchBirthDate ? new Date(watchBirthDate) : undefined
                    }
                    onSelect={(date) =>
                      setValue(
                        "birth_date",
                        date ? format(date, "yyyy-MM-dd") : null,
                        { shouldValidate: true }
                      )
                    }
                    defaultMonth={
                      watchBirthDate
                        ? new Date(watchBirthDate)
                        : new Date(1990, 0)
                    }
                    fromYear={1940}
                    toYear={new Date().getFullYear() - 16}
                    captionLayout="dropdown"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={watchGender ?? "none"}
                onValueChange={(val) =>
                  setValue("gender", val === "none" ? null : val, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {genderOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Civil Status</Label>
              <Select
                value={watchCivilStatus ?? "none"}
                onValueChange={(val) =>
                  setValue("civil_status", val === "none" ? null : val, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select civil status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {civilStatusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="09XX XXX XXXX"
                {...register("phone")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="Complete address"
              {...register("address")}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Employment Information */}
      <Card>
        <CardHeader>
          <CardTitle>Employment Information</CardTitle>
          <CardDescription>
            Position, department, and employment details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Employment Type *</Label>
            <RadioGroup
              value={watchEmploymentType}
              onValueChange={(val) =>
                setValue(
                  "employment_type",
                  val as EmployeeFormValues["employment_type"],
                  { shouldValidate: true }
                )
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="plantilla" id="type-plantilla" />
                <Label htmlFor="type-plantilla" className="font-normal">
                  Plantilla
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="jo" id="type-jo" />
                <Label htmlFor="type-jo" className="font-normal">
                  Job Order
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cos" id="type-cos" />
                <Label htmlFor="type-cos" className="font-normal">
                  Contract of Service
                </Label>
              </div>
            </RadioGroup>
            {errors.employment_type && (
              <p className="text-sm text-destructive">
                {errors.employment_type.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={watchDepartment ?? "none"}
                items={[
                  { value: "none", label: "No Department" },
                  ...departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })),
                ]}
                onValueChange={(val) => {
                  setValue("department_id", val === "none" ? null : val, {
                    shouldValidate: true,
                  });
                  // Reset position when department changes
                  setValue("position_id", null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Department</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.code} — {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Position</Label>
              <Select
                value={watchPosition ?? "none"}
                items={[
                  { value: "none", label: "No Position" },
                  ...filteredPositions.map((p) => ({
                    value: p.id,
                    label: `${p.title}${p.item_number ? ` (${p.item_number})` : ""}`,
                  })),
                ]}
                onValueChange={handlePositionChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Position</SelectItem>
                  {filteredPositions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.title}
                      {pos.item_number && ` (${pos.item_number})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="salary_grade">Salary Grade *</Label>
              <Input
                id="salary_grade"
                type="number"
                min={1}
                max={33}
                {...register("salary_grade")}
                aria-invalid={!!errors.salary_grade}
              />
              {errors.salary_grade && (
                <p className="text-sm text-destructive">
                  {errors.salary_grade.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="step_increment">Step Increment *</Label>
              <Input
                id="step_increment"
                type="number"
                min={1}
                max={8}
                {...register("step_increment")}
                aria-invalid={!!errors.step_increment}
              />
              {errors.step_increment && (
                <p className="text-sm text-destructive">
                  {errors.step_increment.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Hire Date *</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !watchHireDate && "text-muted-foreground"
                      )}
                    />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {watchHireDate
                    ? format(new Date(watchHireDate), "MMMM d, yyyy")
                    : "Select date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      watchHireDate ? new Date(watchHireDate) : undefined
                    }
                    onSelect={(date) =>
                      setValue(
                        "hire_date",
                        date ? format(date, "yyyy-MM-dd") : "",
                        { shouldValidate: true }
                      )
                    }
                    captionLayout="dropdown"
                    fromYear={1970}
                    toYear={new Date().getFullYear() + 1}
                  />
                </PopoverContent>
              </Popover>
              {errors.hire_date && (
                <p className="text-sm text-destructive">
                  {errors.hire_date.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Work Schedule</Label>
              <Select
                value={watchScheduleId ?? "none"}
                items={[
                  { value: "none", label: "Unassigned" },
                  ...schedules.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.time_in.slice(0, 5)}–${s.time_out.slice(0, 5)})`,
                  })),
                ]}
                onValueChange={(val) =>
                  setValue("schedule_id", val === "none" ? null : val, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.time_in.slice(0, 5)}–{s.time_out.slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used by attendance import and DTR to compute tardiness and bucket
                punches.
              </p>
            </div>

            {(watchEmploymentType === "jo" ||
              watchEmploymentType === "cos") && (
              <div className="space-y-2">
                <Label>End of Contract</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !watchEndOfContract && "text-muted-foreground"
                        )}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watchEndOfContract
                      ? format(
                          new Date(watchEndOfContract),
                          "MMMM d, yyyy"
                        )
                      : "Select date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        watchEndOfContract
                          ? new Date(watchEndOfContract)
                          : undefined
                      }
                      onSelect={(date) =>
                        setValue(
                          "end_of_contract",
                          date ? format(date, "yyyy-MM-dd") : null,
                          { shouldValidate: true }
                        )
                      }
                      captionLayout="dropdown"
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 5}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Employee" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/employees")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
