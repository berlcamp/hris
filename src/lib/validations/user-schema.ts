import { z } from "zod";

export const userFormSchema = z.object({
  full_name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Please enter a valid email address")
    .min(1, "Email is required"),
  role: z.enum(
    [
      "ocm_admin",
      "hr_admin",
      "hr_record_manager",
      "department_head",
      "department_admin",
      "department_admin_and_department_head",
      "dtr_manager",
      "cos_manager",
      "jo_manager",
      "employee",
    ],
    {
      message: "Please select a role",
    },
  ),
  department_id: z.string().nullable(),
  is_active: z.boolean(),
  // Only meaningful for the Department Admin roles — the form shows the
  // checkbox for those alone, and updateUser/createUser force it back to true
  // for every other role so a stale "off" cannot come along with a later role
  // change. See migration 076 and canOpenAttendanceCorrections.
  can_access_attendance_corrections: z.boolean(),
  // Only meaningful for the module-manager roles (JO Manager, COS Manager) —
  // same treatment as the corrections switch above: the form shows the
  // checkbox for those alone, and updateUser/createUser force it back to true
  // for every other role. See migration 077 and canManageJobOrderPayroll.
  can_manage_module_payroll: z.boolean(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
