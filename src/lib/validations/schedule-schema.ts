import { z } from "zod";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(80, "Name must be 80 characters or less"),
    time_in: z.string().regex(HHMM, "Use HH:MM (24-hour) format"),
    time_out: z.string().regex(HHMM, "Use HH:MM (24-hour) format"),
    has_break: z.boolean(),
    break_start: z.string().nullable(),
    break_end: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.has_break) {
      if (!val.break_start || !HHMM.test(val.break_start)) {
        ctx.addIssue({
          code: "custom",
          path: ["break_start"],
          message: "Break start is required when break is enabled",
        });
      }
      if (!val.break_end || !HHMM.test(val.break_end)) {
        ctx.addIssue({
          code: "custom",
          path: ["break_end"],
          message: "Break end is required when break is enabled",
        });
      }
    }
  });

export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
