// The officer's review list of unsettled days: every day whose DTR has blank
// cells still to settle, beside the punches the devices actually recorded for
// that duty day, so the officer can see what happened before filing a
// correction. Pure: the server action loads the DTR results and the punches.

export interface ReviewPunch {
  /** Calendar date of the punch (a night shift's clock-out is the next day). */
  date: string;
  /** HH:MM:SS as the device recorded it. */
  time: string;
  device: string | null;
  status: string;
}

export interface UnsettledItem {
  employeeId: string;
  employeeName: string;
  date: string;
  dayOfWeek: string;
  /** AM In, AM Out, PM In, PM Out — HH:MM, null when blank. */
  cells: (string | null)[];
  unsettled: string[];
  /** Late + undertime the DTR charges for the day. */
  utMinutes: number;
  punches: ReviewPunch[];
}

interface ReviewEntry {
  date: string;
  day_of_week: string;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  late_minutes: number;
  undertime_minutes: number;
  unsettled_slots?: readonly string[];
}

interface ReviewResult {
  employee: { id: string; first_name: string; last_name: string };
  entries: ReviewEntry[];
}

/** `punchesByKey` is keyed `${employeeId}_${dutyDate}`. */
export function buildReviewItems(
  results: ReviewResult[],
  punchesByKey: Map<string, ReviewPunch[]>,
): UnsettledItem[] {
  const items: UnsettledItem[] = [];
  for (const r of results) {
    const employeeName = [r.employee.last_name, r.employee.first_name].filter(Boolean).join(", ");
    for (const e of r.entries) {
      if (!e.unsettled_slots || e.unsettled_slots.length === 0) continue;
      const punches = [...(punchesByKey.get(`${r.employee.id}_${e.date}`) ?? [])].sort((a, b) =>
        `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
      );
      items.push({
        employeeId: r.employee.id,
        employeeName,
        date: e.date,
        dayOfWeek: e.day_of_week,
        cells: [e.time_in_am, e.time_out_am, e.time_in_pm, e.time_out_pm],
        unsettled: [...e.unsettled_slots],
        utMinutes: e.late_minutes + e.undertime_minutes,
        punches,
      });
    }
  }
  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName),
  );
}
