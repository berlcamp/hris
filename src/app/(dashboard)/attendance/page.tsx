import Link from "next/link";
import { Plus, Clock, FileSpreadsheet } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAttendanceLogs } from "@/lib/actions/attendance-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { AttendanceTableClient } from "@/components/attendance/attendance-table-client";
import { DahuaImportDialog } from "@/components/attendance/dahua-import-dialog";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const logs = await getAttendanceLogs();
  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);

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
          <Link href="/attendance/dtr">
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4" />
              Monthly DTR
            </Button>
          </Link>
          {isAdmin && (
            <>
              <DahuaImportDialog />
              <Link href="/attendance/entry">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Manual Entry
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <AttendanceTableClient data={logs} isAdmin={isAdmin} />
    </div>
  );
}
