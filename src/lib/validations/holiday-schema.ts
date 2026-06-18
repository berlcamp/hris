import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const HOLIDAY_TYPES = ["full", "half_am", "half_pm"] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  full: "Full day",
  half_am: "Half day (AM)",
  half_pm: "Half day (PM)",
};

export const holidayFormSchema = z.object({
  date: z.string().regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or less"),
  type: z.enum(HOLIDAY_TYPES),
});

export type HolidayFormValues = z.infer<typeof holidayFormSchema>;
