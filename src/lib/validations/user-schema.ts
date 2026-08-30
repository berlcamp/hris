import { z } from "zod";

/**
 * The roles Administration may hand out. "super_admin" is deliberately absent —
 * it is not assignable from the UI at all (createUser/updateUser refuse it too).
 */
export const ASSIGNABLE_ROLES = [
  "ocm_admin",
  "hr_admin",
  "hr_record_manager",
  "department_head",
  "department_admin",
  "department_admin_and_department_head",
  "dtr_manager",
  "cos_manager",
  "jo_manager",
  // The scan-only Attendance Checker (enum value event_attendance_officer,
  // migration 080). Assignable here so HR can appoint one without a SQL
  // console — the role was gated in code from the start but never offered.
  "event_attendance_officer",
  "employee",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const userFormSchema = z.object({
  full_name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Please enter a valid email address")
    .min(1, "Email is required"),
  // An account holds a SET of roles (migration 087). Every role it holds adds
  // its own grants; see the header of src/lib/auth-helpers.ts. At least one is
  // required — an account with none passes no permission check and would look
  // like a bug rather than a deliberately powerless account.
  roles: z
    .array(z.enum(ASSIGNABLE_ROLES))
    .min(1, "Select at least one role"),
  department_id: z.string().nullable(),
  is_active: z.boolean(),
  // Only meaningful for the Department Admin roles — the form shows the
  // checkbox only when one of those is selected, and updateUser/createUser
  // force it back to true otherwise so a stale "off" cannot come along with a
  // later role change. See migration 076 and canOpenAttendanceCorrections.
  can_access_attendance_corrections: z.boolean(),
  // Only meaningful for the module-manager roles (JO Manager, COS Manager) —
  // same treatment as the corrections switch above. See migration 077 and
  // canManageJobOrderPayroll in src/lib/auth-helpers.ts.
  can_manage_module_payroll: z.boolean(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
