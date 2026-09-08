"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QrCardPanel } from "@/components/events/qr-card-panel";
import { formatJoAddress } from "@/lib/job-order-helpers";
import {
  getRegistryQrCard,
  type EmployeeQrCardState,
} from "@/lib/actions/qr-card-actions";
import type { JobOrderEmployee } from "@/lib/types";

function fmtDate(d: string | null): string | null {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : null;
}

function fmtPHP(n: number | null): string | null {
  return n == null
    ? null
    : n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </p>
      <p className="text-sm">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

interface JobOrderDetailDialogProps {
  employee: JobOrderEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the edit form on this employee — the dialog closes first. */
  onEdit: (employee: JobOrderEmployee) => void;
  /** LGU name printed on the attendance card. */
  organizationName: string;
  /** False for accounts that may not see a card token; the QR panel is then hidden. */
  canManageCards: boolean;
}

/**
 * One Job Order employee's record, opened by clicking their name in the list.
 *
 * Job Order personnel have no profile page of their own — the registry is a
 * single table — so the details live here, alongside the attendance card. The
 * card state is fetched when the dialog opens rather than with the list: it is
 * a bearer credential and a QR render per row would cost a query and an image
 * for a hundred rows nobody is looking at.
 */
export function JobOrderDetailDialog({
  employee,
  open,
  onOpenChange,
  onEdit,
  organizationName,
  canManageCards,
}: JobOrderDetailDialogProps) {
  // Keyed by the id it was fetched for rather than cleared when the dialog
  // switches person: clearing would mean a setState in the effect body, and the
  // id comparison below already makes a stale result unusable.
  const [fetched, setFetched] = useState<{
    id: string;
    state: EmployeeQrCardState | null;
  } | null>(null);
  // Bumped after a card is issued, to re-read the state this dialog fetched
  // itself — router.refresh() cannot reach it.
  const [reloadKey, setReloadKey] = useState(0);

  const employeeId = employee?.id ?? null;

  useEffect(() => {
    if (!open || !employeeId || !canManageCards) return;
    let cancelled = false;
    getRegistryQrCard("job_order", employeeId)
      .then((state) => {
        if (!cancelled) setFetched({ id: employeeId, state });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id: employeeId, state: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, canManageCards, reloadKey]);

  const qrCard = fetched?.id === employeeId ? fetched.state : null;
  const loadingCard = fetched?.id !== employeeId;

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {employee.full_name}
            {employee.status === "active" ? (
              <Badge
                variant="outline"
                className="border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
              >
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Inactive
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {[employee.area_name, employee.sub_area]
              .filter((p) => p?.trim())
              .join(" · ") || "Job Order employee"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
            <Field
              label="Sex"
              value={
                employee.sex === "male"
                  ? "Male"
                  : employee.sex === "female"
                    ? "Female"
                    : null
              }
            />
            <Field
              label="Address"
              value={formatJoAddress(employee.purok, employee.barangay) || null}
            />
            <Field label="Area" value={employee.area_name} />
            <Field label="Sub-Area" value={employee.sub_area} />
            <Field label="Daily Rate" value={fmtPHP(employee.daily_rate)} />
            <Field
              label="Previous Daily Rate"
              value={fmtPHP(employee.previous_daily_rate)}
            />
            <Field label="Working Hours" value={employee.working_hours} />
            <Field label="Date Started" value={fmtDate(employee.date_started)} />
            <Field label="Eligibility" value={employee.eligibility} />
            <Field label="Recommended By" value={employee.recommended_by} />
            <Field label="CSC Team" value={employee.csc_team} />
            <Field label="ATM" value={employee.has_atm ? "Yes" : "No"} />
            <Field
              label="Landbank Account No."
              value={employee.landbank_account_number}
            />
            <Field label="SSS No." value={employee.sss_no} />
            <Field
              label="Community Tax No."
              value={employee.community_tax_number}
            />
            <Field
              label="Community Tax Date"
              value={fmtDate(employee.community_tax_date)}
            />
            <Field
              label="Place Issued"
              value={employee.community_tax_place_issued}
            />
            <div className="sm:col-span-2">
              <Field label="Remarks" value={employee.remarks} />
            </div>
          </div>

          {canManageCards && (
            <div className="sm:col-span-2">
              {loadingCard ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading attendance card…
                </div>
              ) : qrCard ? (
                <QrCardPanel
                  owner={{ kind: "job_order", id: employee.id }}
                  state={qrCard}
                  organizationName={organizationName}
                  onIssued={() => setReloadKey((k) => k + 1)}
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" onClick={() => onEdit(employee)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
