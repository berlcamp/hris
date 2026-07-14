"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ClipboardCheck, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  deleteApplication,
  withdrawApplication,
} from "@/lib/actions/rsp-actions";
import type { RspVacancyDetail } from "@/lib/actions/rsp-actions";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_VARIANT,
  formatApplicantName,
} from "@/lib/rsp-constants";
import { AddApplicationDialog } from "@/components/rsp/add-application-dialog";
import { ScreeningDialog } from "@/components/rsp/screening-dialog";

interface ApplicationsTabProps {
  vacancy: RspVacancyDetail;
}

export function ApplicationsTab({ vacancy }: ApplicationsTabProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const applications = vacancy.rsp_applications;
  const canReceive = ["published", "closed"].includes(vacancy.status);

  const handleWithdraw = async (id: string) => {
    setBusy(true);
    const result = await withdrawApplication(id);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Application withdrawn.");
      router.refresh();
    }
    setBusy(false);
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    const result = await deleteApplication(id);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Application deleted.");
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Applications</CardTitle>
          <CardDescription>
            Screen each application against the Qualification Standards.
            Qualified candidates proceed to HRMPSB comparative assessment.
          </CardDescription>
        </div>
        {canReceive && (
          <AddApplicationDialog
            vacancyId={vacancy.id}
            existingApplicantIds={applications.map((a) => a.applicant_id)}
          />
        )}
      </CardHeader>
      <CardContent>
        {applications.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {vacancy.status === "draft"
              ? "Publish the vacancy to start receiving applications."
              : "No applications received yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Education</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Screening Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => {
                const name = app.rsp_applicants
                  ? formatApplicantName(app.rsp_applicants)
                  : "Unknown";
                const hasScores = app.rsp_assessment_scores.length > 0;
                return (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      {format(
                        new Date(`${app.date_received}T00:00:00`),
                        "MMM d, yyyy"
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {app.education ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {app.eligibility ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={APPLICATION_STATUS_VARIANT[app.status]}>
                        {APPLICATION_STATUS_LABELS[app.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {app.screening_remarks ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {["pending", "qualified", "disqualified"].includes(
                          app.status
                        ) &&
                          !hasScores && (
                            <ScreeningDialog
                              applicationId={app.id}
                              applicantName={name}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Screen application"
                                  title="Screen vs QS"
                                >
                                  <ClipboardCheck className="h-4 w-4" />
                                </Button>
                              }
                            />
                          )}
                        {["pending", "qualified"].includes(app.status) && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Withdraw application"
                                  title="Withdraw"
                                  disabled={busy}
                                />
                              }
                            >
                              <Undo2 className="h-4 w-4" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Withdraw application?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Marks {name}&apos;s application as withdrawn
                                  at the applicant&apos;s request. The record
                                  is kept.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleWithdraw(app.id)}
                                >
                                  Withdraw
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {app.status === "pending" && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Delete application"
                                  title="Delete"
                                  disabled={busy}
                                />
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete application?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Permanently removes {name}&apos;s application
                                  (encoding error). This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(app.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
