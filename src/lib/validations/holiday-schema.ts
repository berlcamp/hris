import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Two families share this column.
//
// full / half_am / half_pm declare a non-working holiday: nobody reports for
// the covered part of the day, it is never an absence, and the printed DTR
// stamps HOLIDAY over it.
//
// no_am_deductions / no_pm_deductions declare an ordinary WORKING day on which
// the org waives late and undertime for one session — a flag ceremony that
// eats the morning, an afternoon program. Employees still report, a no-show is
// still an absence, and nothing is printed over the cells; only the
// late/undertime charge for that session is dropped.
export const HOLIDAY_TYPES = [
  "full",
  "half_am",
  "half_pm",
  "no_am_deductions",
  "no_pm_deductions",
] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  full: "Full day",
  half_am: "Half day (AM)",
  half_pm: "Half day (PM)",
  no_am_deductions: "No AM deductions",
  no_pm_deductions: "No PM deductions",
};

/**
 * True only for the types that declare an actual non-working holiday.
 *
 * Anything asking "is this date a holiday?" for a reason other than
 * late/undertime — CTO day-type multipliers, working-day counts — must go
 * through this. The waiver types are working days and would otherwise be paid
 * or credited as holidays.
 */
export function isNonWorkingHoliday(type: HolidayType): boolean {
  return type === "full" || type === "half_am" || type === "half_pm";
}

/**
 * Which sessions a declared calendar entry excuses from late and undertime.
 *
 * The single home of that rule — dtr-builder feeds the result straight into
 * dayLateUndertime's excuseAm/excusePm. Keeping it here, beside HOLIDAY_TYPES,
 * is what makes a new type's effect on the DTR one edit rather than a hunt
 * through the builder. An unrecognised type excuses nothing, so a forgotten
 * case is a visible no-op rather than a silent waiver.
 */
export function holidayExcusedSessions(type: HolidayType | null): {
  am: boolean;
  pm: boolean;
} {
  switch (type) {
    case "full":
      return { am: true, pm: true };
    case "half_am":
    case "no_am_deductions":
      return { am: true, pm: false };
    case "half_pm":
    case "no_pm_deductions":
      return { am: false, pm: true };
    default:
      return { am: false, pm: false };
  }
}

export const holidayFormSchema = z.object({
  date: z.string().regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or less"),
  type: z.enum(HOLIDAY_TYPES),
});

export type HolidayFormValues = z.infer<typeof holidayFormSchema>;
