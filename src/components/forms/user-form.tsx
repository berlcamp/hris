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
import {
  userFormSchema,
  type AssignableRole,
  type UserFormValues,
} from "@/lib/validations/user-schema";
import { hasAnyRole, isDeptAdmin, isScanOnlyAccount } from "@/lib/auth-helpers";
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

/**
 * Every role Administration can hand out, widest reach first — the same order
 * ROLE_PRECEDENCE uses, so the list reads top-down from "runs the system" to
 * "sees their own record".
 *
 * An account may hold any combination of these. Roles only ever ADD access:
 * ticking a second box can never take a power away from the first.
 */
const roleOptions: {
  value: AssignableRole;
  label: string;
  description: string;
}[] = [
  {
    value: "hr_admin",
    label: "HR Admin",
    description:
      "Full HR reach: employees, plantilla, leave, attendance, payroll and reports.",
  },
  {
    value: "ocm_admin",
    label: "OCM Admin",
    description:
      "Office of the City Mayor: approves leave and CTO across departments and records attendance.",
  },
  {
    value: "dtr_manager",
    label: "DTR Manager",
    description:
      "Attendance only: DTRs for every department, biometric imports, schedules and holidays.",
  },
  {
    value: "hr_record_manager",
    label: "HR Record Manager",
    description:
      "Employee records, plantilla and NOSI only — no attendance, leave or payroll.",
  },
  {
    value: "department_admin_and_department_head",
    label: "Department Admin + Head",
    description:
      "Both department roles, plus cross-department reach inside the Leave and CTO modules.",
  },
  {
    value: "department_head",
    label: "Department Head",
    description: "Approves leave and CTO for their own department.",
  },
  {
    value: "department_admin",
    label: "Department Admin",
    description:
      "Files leave, CTO and attendance corrections for their own department.",
  },
  {
    value: "jo_manager",
    label: "JO Manager",
    description: "Runs the Job Orders module: employees, areas, memos, payroll.",
  },
  {
    value: "cos_manager",
    label: "COS Manager",
    description:
      "Runs the Contract of Service module: employees, contracts, payroll.",
  },
  {
    // Scan-only when held ALONE: the account sees the mobile Attendance Checker
    // app at /scan and nothing else. Combined with any other role it simply
    // adds the ability to scan. See isScanOnlyAccount in src/lib/auth-helpers.
    value: "event_attendance_officer",
    label: "Attendance Checker",
    description:
      "Scans QR cards at an event door. On its own, this account only sees the scanner app.",
  },
  {
    value: "employee",
    label: "Employee",
    description: "Their own profile, DTR, leave and CTO.",
  },
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
      roles: ["employee"],
      department_id: null,
      is_active: true,
      can_access_attendance_corrections: true,
      can_manage_module_payroll: true,
    },
  });

  const watchRoles = watch("roles") ?? [];
  const watchDepartment = watch("department_id");
  const watchActive = watch("is_active");
  const watchCorrections = watch("can_access_attendance_corrections");
  const watchModulePayroll = watch("can_manage_module_payroll");

  // The switch is a Department Admin concern only: every other role's reach
  // over corrections is settled by the role itself (reviewers, the direct-apply
  // OCM Admin, the read-only Department Head), so there is nothing to toggle.
  // The composite "Dept Admin + Head" is included because it inherits the
  // dept-admin powers — see isDeptAdmin in src/lib/auth-helpers.ts.
  const showCorrectionsToggle = isDeptAdmin(watchRoles);

  // The payroll switch qualifies the two module-manager roles only: every
  // other role's payroll reach is settled by the role itself. See migration
  // 077 and canManageJobOrderPayroll in src/lib/auth-helpers.ts.
  const showModulePayrollToggle = hasAnyRole(
    watchRoles,
    "jo_manager",
    "cos_manager",
  );

  const toggleRole = (role: AssignableRole, checked: boolean) => {
    const next = checked
      ? [...watchRoles, role]
      : watchRoles.filter((r) => r !== role);
    setValue("roles", next, { shouldValidate: true });
  };

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

          {/* Roles */}
          <div className="space-y-2">
            <div className="space-y-0.5">
              <Label>Roles</Label>
              <p className="text-sm text-muted-foreground">
                Pick every hat this person wears. Roles add up — an account with
                two roles can do everything either one allows.
              </p>
            </div>

            <div
              role="group"
              aria-label="Roles"
              className="divide-y rounded-lg border"
            >
              {roleOptions.map((option) => {
                const checked = watchRoles.includes(option.value);
                return (
                  <label
                    key={option.value}
                    htmlFor={`role-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`role-${option.value}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleRole(option.value, !!value)
                      }
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium leading-none">
                        {option.label}
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            {errors.roles && (
              <p className="text-sm text-destructive">
                {errors.roles.message}
              </p>
            )}

            {/* The Checker on its own is a whole different application — worth
                saying out loud, because it looks like just another tick box. */}
            {isScanOnlyAccount(watchRoles) && (
              <p className="text-sm text-muted-foreground">
                With only this role, the account signs in straight to the
                scanner app and sees no other module. Add a second role to give
                it the dashboard as well.
              </p>
            )}

            {/* Sits under the roles because it only qualifies one of them — it
                is a Department Admin setting, not a general account setting. */}
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
