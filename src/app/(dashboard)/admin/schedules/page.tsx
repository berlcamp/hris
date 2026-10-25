import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getSchedules, getSchedulesWithCounts } from "@/lib/actions/schedule-actions";
import {
  getAssignableEmployees,
  getScheduleRotations,
} from "@/lib/actions/rotation-actions";
import { ScheduleManager } from "@/components/admin/schedule-manager";
import { RotationManager } from "@/components/admin/rotation-manager";
import { RotationAssigner } from "@/components/admin/rotation-assigner";
import { ScheduleCalendar } from "@/components/admin/schedule-calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageSchedules, isDeptAdmin } from "@/lib/auth-helpers";
import { manilaToday } from "@/lib/format-date";

// Schedule managers (super admin / DTR manager) get every tab. A department
// admin gets Assign and Calendar for their own department's employees only —
// rotation templates are shared by the whole LGU and stay with the managers.
export default async function SchedulesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const manager = canManageSchedules(user.roles);
  if (!manager && !isDeptAdmin(user.roles)) redirect("/dashboard");

  const [schedules, scheduleList, rotations, employees] = await Promise.all([
    manager ? getSchedulesWithCounts() : Promise.resolve([]),
    getSchedules(),
    getScheduleRotations(),
    getAssignableEmployees(),
  ]);
  const today = manilaToday();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Schedules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shift templates, rotations and per-day schedules. The importer and the
          DTR read each day against the schedule that applies to it, and a REST
          day owes no hours.
        </p>
      </div>
      <Tabs defaultValue={manager ? "schedules" : "assign"}>
        <TabsList>
          {manager && <TabsTrigger value="schedules">Schedules</TabsTrigger>}
          {manager && <TabsTrigger value="rotations">Rotations</TabsTrigger>}
          <TabsTrigger value="assign">Assign</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        {manager && (
          <TabsContent value="schedules" className="pt-4">
            <ScheduleManager initialSchedules={schedules} />
          </TabsContent>
        )}
        {manager && (
          <TabsContent value="rotations" className="pt-4">
            <RotationManager rotations={rotations} schedules={scheduleList} />
          </TabsContent>
        )}
        <TabsContent value="assign" className="pt-4">
          <RotationAssigner employees={employees} rotations={rotations} today={today} />
        </TabsContent>
        <TabsContent value="calendar" className="pt-4">
          <ScheduleCalendar employees={employees} schedules={scheduleList} today={today} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
