import { z } from "zod";

export const employeeFormSchema = z.object({
  user_profile_id: z.string().nullable(),
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
  employment_type: z.enum(["plantilla", "jo", "cos"], {
    message: "Please select an employment type",
  }),
  position_id: z.string().nullable(),
  department_id: z.string().nullable(),
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
  hire_date: z.string().min(1, "Hire date is required"),
  end_of_contract: z.string().nullable(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
