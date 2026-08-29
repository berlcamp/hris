import { z } from "zod";

export const eventSubjectKindSchema = z.enum([
  "employee",
  "job_order",
  "cos",
  "temporary",
]);

export const eventMetadataSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    venue: z.string().trim().max(200).optional().or(z.literal("")),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date cannot be before the start date",
    path: ["end_date"],
  });

export type EventMetadataValues = z.infer<typeof eventMetadataSchema>;

/**
 * Roster build filters. `department_ids` narrows plantilla and COS;
 * `area_ids` narrows Job Order, which has no department at all. They are
 * separate fields because they are separate axes — see GROUP_AXIS in
 * src/lib/event-repo.ts.
 */
export const eventRosterBuildSchema = z.object({
  event_id: z.string().uuid(),
  kinds: z.array(eventSubjectKindSchema).min(1, "Pick at least one personnel type"),
  department_ids: z.array(z.string().uuid()).default([]),
  area_ids: z.array(z.string().uuid()).default([]),
});

export type EventRosterBuildValues = z.infer<typeof eventRosterBuildSchema>;

/**
 * One queued scan from the device. `scanned_at` is the DEVICE clock, not the
 * server's: a scan taken at 23:58 and synced next morning belongs to the day it
 * happened. `client_scan_id` makes a replayed batch harmless.
 */
export const eventScanSchema = z.object({
  client_scan_id: z.string().min(1).max(64),
  token: z.string().trim().min(1).max(64),
  scanned_at: z.string().min(1),
});

export const eventScanBatchSchema = z.object({
  event_id: z.string().uuid(),
  scans: z.array(eventScanSchema).min(1).max(500),
});

export type EventScanValues = z.infer<typeof eventScanSchema>;
export type EventScanBatchValues = z.infer<typeof eventScanBatchSchema>;

/** The officer marking someone present by name — no card, or an unreadable one. */
export const eventManualAttendanceSchema = z.object({
  event_id: z.string().uuid(),
  subject_kind: eventSubjectKindSchema,
  subject_id: z.string().uuid(),
  attendance_date: z.string().min(1),
});

export type EventManualAttendanceValues = z.infer<
  typeof eventManualAttendanceSchema
>;
