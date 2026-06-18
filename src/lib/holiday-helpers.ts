import type { createAdminClient } from "@/lib/supabase/admin";
import type { HolidayType } from "@/lib/validations/holiday-schema";

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Map of date (YYYY-MM-DD) → holiday within [startDate, endDate] inclusive.
 * Used by the DTR generators to overlay the HOLIDAY label. Plain server helper
 * (not a server action) so it can take a Supabase client argument.
 */
export async function getHolidayMap(
  supabase: SupabaseAdmin,
  startDate: string,
  endDate: string,
): Promise<Map<string, { name: string; type: HolidayType }>> {
  const { data } = await supabase
    .schema("hris")
    .from("holidays")
    .select("date, name, type")
    .gte("date", startDate)
    .lte("date", endDate);
  const map = new Map<string, { name: string; type: HolidayType }>();
  for (const h of (data ?? []) as { date: string; name: string; type: HolidayType }[]) {
    map.set(h.date, { name: h.name, type: h.type });
  }
  return map;
}
