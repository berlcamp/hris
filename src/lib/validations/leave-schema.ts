import { z } from "zod";

export const leaveApplicationSchema = z
  .object({
    employee_id: z.string().min(1, "Employee is required"),
    leave_type_id: z.string().min(1, "Leave type is required"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    days_applied: z.coerce
      .number()
      .min(0.5, "Must apply for at least 0.5 days"),
    reason: z.string().nullable(),
  })
  .refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

export type LeaveApplicationFormValues = z.infer<typeof leaveApplicationSchema>;

export const leaveCreditAdjustmentSchema = z.object({
  employee_id: z.string().min(1, "Employee is required"),
  leave_type_id: z.string().min(1, "Leave type is required"),
  year: z.coerce.number().int().min(2000).max(2100),
  adjustment: z.coerce.number().min(-999).max(999),
  reason: z.string().min(1, "Reason is required"),
});

export type LeaveCreditAdjustmentValues = z.infer<typeof leaveCreditAdjustmentSchema>;
