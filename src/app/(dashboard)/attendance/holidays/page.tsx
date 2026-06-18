import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getHolidays } from "@/lib/actions/holiday-actions";
import { HolidayManager } from "@/components/attendance/holiday-manager";
import { canManageSchedules } from "@/lib/auth-helpers";

export default async function HolidaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageSchedules(user.role)) redirect("/dashboard");

  const holidays = await getHolidays();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Holidays</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Declare holidays so they print as &ldquo;HOLIDAY&rdquo; on the DTR.
          A full day covers the whole row; a half day (AM or PM) marks only that
          half and keeps the working half on the record.
        </p>
      </div>
      <HolidayManager initialHolidays={holidays} />
    </div>
  );
}
