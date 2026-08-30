import Link from "next/link";
import { Plus, FileSpreadsheet, Printer, CalendarOff } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAttendanceLogs } from "@/lib/actions/attendance-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  canAccessAttendance,
  canDirectApplyAttendanceCorrection,
  canPrintDtr,
  isAttendanceManager,
  canManageSchedules,
} from "@/lib/auth-helpers";
import { AttendanceTableClient } from "@/components/attendance/attendance-table-client";
import { DahuaImportDialog } from "@/components/attendance/dahua-import-dialog";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessAttendance(user.roles)) redirect("/dashboard");

  const logs = await getAttendanceLogs();
  const isAdmin = isAttendanceManager(user.roles);
  const canBulkDtr = canPrintDtr(user.roles);
  const canEnterManually = canDirectApplyAttendanceCorrection(user.roles);
  const canManageHolidays = canManageSchedules(user.roles);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance & DTR
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track daily attendance, import biometric data, and generate DTR
            reports.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageHolidays && (
            <Link href="/attendance/holidays">
              <Button variant="outline" size="sm">
                <CalendarOff className="h-4 w-4" />
                Holidays
              </Button>
            </Link>
          )}
          <Link href="/attendance/dtr">
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4" />
              Individual DTR
            </Button>
          </Link>
          {canBulkDtr && (
            <Link href="/attendance/dtr/bulk">
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4" />
                Bulk DTR
              </Button>
            </Link>
          )}
          {isAdmin && <DahuaImportDialog />}
          {/* Recording attendance by hand lives in the corrections module now:
              one screen, one audit trail, and rows protected from a later
              biometric overwrite. The role set is unchanged — the direct-apply
              roles are exactly the old MANUAL_ENTRY_ROLES. */}
          {canEnterManually && (
            <Link href="/attendance-corrections/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Record Attendance
              </Button>
            </Link>
          )}
        </div>
      </div>

      <AttendanceTableClient
        data={logs}
        canManage={canEnterManually}
        canDelete={isAdmin}
      />
    </div>
  );
}
