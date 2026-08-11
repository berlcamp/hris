"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { userFormSchema, type UserFormValues } from "@/lib/validations/user-schema";
import { isDeptAdmin } from "@/lib/auth-helpers";
import { createUser, updateUser } from "@/lib/actions/user-actions";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface UserFormProps {
  departments: Department[];
  defaultValues?: UserFormValues & { id?: string };
  mode: "create" | "edit";
}

const roleOptions = [
  { value: "ocm_admin", label: "OCM Admin" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "hr_record_manager", label: "HR Record Manager" },
  { value: "department_head", label: "Department Head" },
  { value: "department_admin", label: "Department Admin" },
  {
    value: "department_admin_and_department_head",
    label: "Department Admin + Head",
  },
  { value: "dtr_manager", label: "DTR Manager" },
  { value: "cos_manager", label: "COS Manager" },
  { value: "jo_manager", label: "JO Manager" },
  { value: "employee", label: "Employee" },
];

export function UserForm({ departments, defaultValues, mode }: UserFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultValues ?? {
      full_name: "",
      email: "",
      role: "employee",
      department_id: null,
      is_active: true,
      can_access_attendance_corrections: true,
      can_manage_module_payroll: true,
    },
  });

  const watchRole = watch("role");
  const watchDepartment = watch("department_id");
  const watchActive = watch("is_active");
  const watchCorrections = watch("can_access_attendance_corrections");
  const watchModulePayroll = watch("can_manage_module_payroll");

  // The switch is a Department Admin concern only: every other role's reach
  // over corrections is settled by the role itself (reviewers, the direct-apply
  // OCM Admin, the read-only Department Head), so there is nothing to toggle.
  // The composite "Dept Admin + Head" is included because it inherits the
  // dept-admin powers — see isDeptAdmin in src/lib/auth-helpers.ts.
  const showCorrectionsToggle = isDeptAdmin(watchRole);

  // The payroll switch qualifies the two module-manager roles only: every
  // other role's payroll reach is settled by the role itself. See migration
  // 077 and canManageJobOrderPayroll in src/lib/auth-helpers.ts.
  const showModulePayrollToggle =
    watchRole === "jo_manager" || watchRole === "cos_manager";

  const onSubmit = async (data: UserFormValues) => {
    setLoading(true);

    const result =
      mode === "create"
        ? await createUser(data)
        : await updateUser({ ...data, id: defaultValues!.id! });

    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success(
      mode === "create"
        ? "User created successfully."
        : "User updated successfully."
    );
    router.push("/admin/users");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "New User" : "Edit User"}</CardTitle>
          <CardDescription>
            {mode === "create"
              ? "Add a new user to the system. They will be able to sign in with this email via Google OAuth."
              : "Update this user's information and access settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              placeholder="Juan Dela Cruz"
              {...register("full_name")}
              aria-invalid={!!errors.full_name}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="juan.delacruz@gmail.com"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={watchRole}
              items={roleOptions}
              onValueChange={(val) =>
                setValue("role", val as UserFormValues["role"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}

            {/* Sits under the role because it only qualifies that role — it is
                a Department Admin setting, not a general account setting. */}
            {showCorrectionsToggle && (
              <div className="flex items-start gap-3 rounded-lg border p-3 mt-3">
                <Checkbox
                  id="can_access_attendance_corrections"
                  checked={watchCorrections}
                  onCheckedChange={(checked) =>
                    setValue("can_access_attendance_corrections", checked, {
                      shouldValidate: true,
                    })
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="can_access_attendance_corrections"
                    className="font-normal"
                  >
                    Can access Attendance Corrections
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Lets this Department Admin file attendance correction
                    requests for their department. Unchecked, the module is
                    hidden and the route is closed to them.
                  </p>
                </div>
              </div>
            )}

            {showModulePayrollToggle && (
              <div className="flex items-start gap-3 rounded-lg border p-3 mt-3">
                <Checkbox
                  id="can_manage_module_payroll"
                  checked={watchModulePayroll}
                  onCheckedChange={(checked) =>
                    setValue("can_manage_module_payroll", checked, {
                      shouldValidate: true,
                    })
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="can_manage_module_payroll"
                    className="font-normal"
                  >
                    Can create/edit Payroll
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Lets this manager create payrolls in their module and edit
                    members, rates and days. Unchecked, the payroll module is
                    read-only — they can still open and print a run, but not
                    change one.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={watchDepartment ?? "none"}
              items={[
                { value: "none", label: "No Department" },
                ...departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })),
              ]}
              onValueChange={(val) =>
                setValue("department_id", val === "none" ? null : val, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a department" />
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

          {/* Active Status */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Active Status</Label>
              <p className="text-sm text-muted-foreground">
                Inactive users cannot sign in to the system.
              </p>
            </div>
            <Switch
              id="is_active"
              checked={watchActive}
              onCheckedChange={(checked) =>
                setValue("is_active", checked, { shouldValidate: true })
              }
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create User" : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/users")}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
