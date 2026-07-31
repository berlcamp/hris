import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { attendanceCorrectionColumns } from "@/components/tables/columns/attendance-correction-columns";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { listCorrectionRequests } from "@/lib/actions/attendance-correction-actions";
import {
  canDirectApplyAttendanceCorrection,
  canFileAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";

export default async function AttendanceCorrectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canRequest = canFileAttendanceCorrection(user.role);
  const isReviewer = canReviewAttendanceCorrection(user.role);
  const isDirect = canDirectApplyAttendanceCorrection(user.role);
  // The two sides of the workflow share this route; anyone on neither side has
  // no business here. listCorrectionRequests throws for them anyway — this
  // just turns that into a redirect instead of an error page.
  if (!canRequest && !isReviewer) redirect("/dashboard");

  const requests = await listCorrectionRequests();

  // Reviewers work a queue, so live requests come first regardless of age;
  // within each bucket the action's `requested_at DESC` ordering stands.
  // Requesters are tracking their own filings, so newest-first is right for
  // them and the list is left as returned.
  const LIVE = ["pending", "needs_rebase"];
  const rows = isReviewer
    ? [
        ...requests.filter((r) => LIVE.includes(r.status)),
        ...requests.filter((r) => !LIVE.includes(r.status)),
      ]
    : requests;

  const liveCount = requests.filter((r) => LIVE.includes(r.status)).length;

  // Only reviewers see requests from more than one department, so the
  // department filter would be a single-option no-op for a requester.
  const departments = isReviewer ? await getDepartments() : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance Corrections
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isDirect
              ? "Record attendance directly, and review the proof-backed requests departments file. Yours apply on save; theirs wait for your approval."
              : "File proof-backed corrections to your department's attendance. HR reviews every request before it reaches the DTR."}
          </p>
        </div>
        {canRequest && (
          <Link href="/attendance-corrections/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              {isDirect ? "Record Attendance" : "New Request"}
            </Button>
          </Link>
        )}
      </div>

      {isReviewer && liveCount > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{liveCount}</span>{" "}
          {liveCount === 1 ? "request is" : "requests are"} waiting for review.
        </p>
      )}

      <DataTable
        columns={attendanceCorrectionColumns}
        data={rows}
        initialColumnVisibility={{ department: false }}
        searchableColumns={[{ id: "employee", title: "employee" }]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Pending", value: "pending" },
              { label: "Needs update", value: "needs_rebase" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "Withdrawn", value: "cancelled" },
            ],
          },
          ...(isReviewer
            ? [
                {
                  id: "department",
                  title: "Department",
                  options: departments.map((d) => ({
                    label: d.code ? `${d.code} — ${d.name}` : d.name,
                    value: d.code ?? "",
                  })),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
