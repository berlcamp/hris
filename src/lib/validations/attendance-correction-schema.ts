import { z } from "zod";
import { CORRECTION_REASONS } from "../constants.ts";
import { ABSENT_REASON } from "../attendance-schedule.ts";

/**
 * YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30).
 * Built entirely on Date.UTC/getUTC* rather than local-time parsing + an
 * ISO-string comparison — the latter shifts by a day in any timezone ahead
 * of UTC (this server runs Asia/Manila, UTC+8) and would reject valid dates.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, "That date does not exist");

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time")
  .nullable();

const reason = z.enum(CORRECTION_REASONS).nullable();

type ItemSlots = Record<
  `time_${"in_am" | "out_am" | "in_pm" | "out_pm"}` | `reason_${"in_am" | "out_am" | "in_pm" | "out_pm"}`,
  string | null
>;

// A slot states a time or a reason, never both.
function everySlotHasOneValue(i: ItemSlots): boolean {
  return (
    !(i.time_in_am && i.reason_in_am) &&
    !(i.time_out_am && i.reason_out_am) &&
    !(i.time_in_pm && i.reason_in_pm) &&
    !(i.time_out_pm && i.reason_out_pm)
  );
}

// ABSENT covers a pair: AM In with AM Out, PM In with PM Out, or on a no-break
// schedule, where the two middle slots are unused, AM In with PM Out. The schedule
// is not known here, so the no-break shape is recognised by those empty slots.
function absentComesInPairs(i: ItemSlots): boolean {
  const absent = (r: string | null) => r === ABSENT_REASON;
  const inAm = absent(i.reason_in_am);
  const outAm = absent(i.reason_out_am);
  const inPm = absent(i.reason_in_pm);
  const outPm = absent(i.reason_out_pm);
  if (inAm === outAm && inPm === outPm) return true;
  return (
    inAm &&
    outPm &&
    !i.time_out_am &&
    !i.reason_out_am &&
    !i.time_in_pm &&
    !i.reason_in_pm
  );
}

export const correctionItemSchema = z.object({
  duty_date: isoDate,
  // NULL means "this date has no attendance row" — the item CREATES the day
  // rather than updating one. See migration 067.
  attendance_log_id: z.uuid().nullable(),
  disposition: z.enum(["update", "clear_as_off"]),
  proposed_schedule_id: z.uuid().nullable(),
  time_in_am: hhmm,
  time_out_am: hhmm,
  time_in_pm: hhmm,
  time_out_pm: hhmm,
  reason_in_am: reason,
  reason_out_am: reason,
  reason_in_pm: reason,
  reason_out_pm: reason,
})
  .refine(everySlotHasOneValue, {
    message: "A time slot takes either a time or a reason, not both",
  })
  .refine(absentComesInPairs, {
    message: "ABSENT must be set on both slots of a pair",
  });

export const correctionRequestSchema = z
  .object({
    employee_id: z.uuid(),
    date_from: isoDate,
    date_to: isoDate,
    reason: z.string().trim().min(5, "Describe the reason for this correction"),
    items: z
      .array(correctionItemSchema)
      .min(1, "Select at least one day to correct"),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: "The end date must not precede the start date",
    path: ["date_to"],
  })
  // The apply function keys items by duty_date (migration 067), and the table
  // enforces UNIQUE (request_id, duty_date). Catching a duplicate here gives a
  // readable message instead of a constraint violation mid-insert — which, on
  // that path, also has to compensate by deleting the request row it already
  // committed.
  .refine(
    (v) => new Set(v.items.map((i) => i.duty_date)).size === v.items.length,
    { message: "The same day appears twice", path: ["items"] },
  )
  // Every item must fall inside the range the request declares and the
  // supporting document justifies.
  .refine(
    (v) => v.items.every((i) => i.duty_date >= v.date_from && i.duty_date <= v.date_to),
    { message: "A day falls outside the request's date range", path: ["items"] },
  );

export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;
export type CorrectionItemFormValues = z.infer<typeof correctionItemSchema>;
