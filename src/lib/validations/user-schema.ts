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
  role: z.enum(["hr_admin", "department_head", "employee"], {
    message: "Please select a role",
  }),
  department_id: z.string().nullable(),
  is_active: z.boolean(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
