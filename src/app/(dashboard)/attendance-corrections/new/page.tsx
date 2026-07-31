import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getCorrectableEmployees } from "@/lib/actions/attendance-correction-actions";
import { getSchedules } from "@/lib/actions/schedule-actions";
import {
  canDirectApplyAttendanceCorrection,
  canFileAttendanceCorrection,
} from "@/lib/auth-helpers";
import { CorrectionRequestForm } from "@/components/attendance-corrections/correction-request-form";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewCorrectionRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canFileAttendanceCorrection(user.role)) {
    redirect("/attendance-corrections");
  }
  // Prefill for "Correct entry" on the attendance table, which used to open the
  // single-entry form. Keeps that a one-click path. Validated here rather than
  // trusted: these only preselect a picker, and the actions re-authorise the
  // employee independently, but a bad date would put the grid in a broken state.
  const { employee, date } = await searchParams;
  const prefill = {
    employeeId: employee ?? null,
    date: date && ISO_DATE.test(date) ? date : null,
  };
  // Reviewer-level roles file corrections that apply on submit; a department
  // admin files a request that a reviewer must approve. Decided on the server
  // and passed down purely so the form can say which it is — the action
  // re-derives it from the role and never trusts this.
  const directApply = canDirectApplyAttendanceCorrection(user.role);

  const [employees, schedules] = await Promise.all([
    getCorrectableEmployees(),
    getSchedules(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/attendance-corrections">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {directApply ? "Record Attendance" : "New Correction Request"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {directApply
              ? "Record or correct attendance for any active employee. Changes apply as soon as you save."
              : "Fix misread or incomplete attendance days. HR reviews every request before anything reaches the DTR."}
          </p>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">
            No employees in your department are correction-eligible yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            HR flags who can be corrected, from the employee record. Ask them to
            enable it for the employees you need to file for.
          </p>
        </div>
      ) : (
        <CorrectionRequestForm
          employees={employees}
          schedules={schedules}
          directApply={directApply}
          prefill={prefill}
        />
      )}
    </div>
  );
}
