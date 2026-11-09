import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSchedules, getSchedulesWithCounts } from "@/lib/actions/schedule-actions";
import { getAssignableEmployees } from "@/lib/actions/schedule-override-actions";
import { ScheduleManager } from "@/components/admin/schedule-manager";
import { ScheduleCalendar } from "@/components/admin/schedule-calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageSchedules, isDeptAdmin } from "@/lib/auth-helpers";
import { manilaToday } from "@/lib/format-date";

// Schedule managers (super admin / DTR manager) get both tabs. A department
// admin gets the Calendar for their own department's employees only — shift
// templates are shared by the whole LGU and stay with the managers.
export default async function SchedulesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const manager = canManageSchedules(user.roles);
  if (!manager && !isDeptAdmin(user.roles)) redirect("/dashboard");

  const [schedules, scheduleList, employees] = await Promise.all([
    manager ? getSchedulesWithCounts() : Promise.resolve([]),
    getSchedules(),
    getAssignableEmployees(),
  ]);
  const today = manilaToday();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Schedules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shift templates and per-day schedules. The importer and the
          DTR read each day against the schedule that applies to it, and a REST
          day owes no hours.
        </p>
      </div>
      <Tabs defaultValue={manager ? "schedules" : "calendar"}>
        <TabsList>
          {manager && <TabsTrigger value="schedules">Schedules</TabsTrigger>}
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        {manager && (
          <TabsContent value="schedules" className="pt-4">
            <ScheduleManager initialSchedules={schedules} />
          </TabsContent>
        )}
        <TabsContent value="calendar" className="pt-4">
          <ScheduleCalendar employees={employees} schedules={scheduleList} today={today} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
