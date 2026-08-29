import { z } from "zod";

/**
 * A temporary employee is a name and nothing else — no plantilla item, no
 * salary grade that means anything, no hire date on file. The form hides those
 * fields for that type, so the schema must not demand them either; the server
 * fills the columns the table still requires NOT NULL.
 */
const employeeFormBaseSchema = z.object({
  id_number: z
    .string()
    .max(50, "ID number must be less than 50 characters")
    .nullable(),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters"),
  middle_name: z.string().nullable(),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters"),
  suffix: z.string().nullable(),
  birth_date: z.string().nullable(),
  gender: z.string().nullable(),
  civil_status: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  employment_type: z.enum(["plantilla", "jo", "cos", "temporary"], {
    message: "Please select an employment type",
  }),
  position_id: z.string().nullable(),
  department_id: z.string().nullable(),
  detailed_department_id: z.string().nullable(),
  is_department_head: z.boolean(),
  salary_grade: z.coerce
    .number()
    .int()
    .min(1, "Salary grade must be at least 1")
    .max(33, "Salary grade must be at most 33"),
  step_increment: z.coerce
    .number()
    .int()
    .min(1, "Step must be at least 1")
    .max(8, "Step must be at most 8"),
  hire_date: z.string(),
  end_of_contract: z.string().nullable(),
  schedule_id: z.string().nullable(),
});

export const employeeFormSchema = employeeFormBaseSchema.superRefine(
  (val, ctx) => {
    if (val.employment_type !== "temporary" && !val.hire_date) {
      ctx.addIssue({
        code: "custom",
        path: ["hire_date"],
        message: "Hire date is required",
      });
    }
  },
);

export type EmployeeFormValues = z.infer<typeof employeeFormBaseSchema>;
