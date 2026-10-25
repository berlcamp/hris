import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import {
  canDirectApplyAttendanceCorrection,
  canFileAttendanceCorrection,
  dtrGuideAudience,
} from "@/lib/auth-helpers";
import { manilaToday } from "@/lib/format-date";
import { UnsettledReview } from "@/components/attendance-corrections/unsettled-review";
import { DtrGuideDialog } from "@/components/dtr/dtr-guide-dialog";

// Days whose DTR still has blank cells to settle, with the punches behind
// them, so an officer can fix them before the DTR is printed.
export default async function UnsettledDaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canFileAttendanceCorrection(user)) redirect("/attendance-corrections");

  const direct = canDirectApplyAttendanceCorrection(user.roles);
  const departments = direct ? await getDepartments() : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/attendance-corrections">
            <Button variant="ghost" size="icon-sm" aria-label="Back to Attendance Corrections">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Unsettled Days</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Days with blank DTR cells, beside the punches each device recorded.
              Settle them before the DTR is printed.
            </p>
          </div>
        </div>
        <DtrGuideDialog audience={dtrGuideAudience(user)} />
      </div>
      <UnsettledReview
        directApply={direct}
        departments={departments.map((d) => ({ id: d.id as string, name: d.name as string }))}
        today={manilaToday()}
      />
    </div>
  );
}
