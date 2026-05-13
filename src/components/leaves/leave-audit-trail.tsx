import { formatDistanceToNow } from "date-fns";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldCheck,
  Activity,
  Clock,
} from "lucide-react";

const MANILA_TZ = "Asia/Manila";

const manilaShortFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const manilaLongFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TZ,
  dateStyle: "long",
  timeStyle: "long",
});

/** "Mar 5, 2026 at 9:30 AM" in Asia/Manila. */
function formatManila(d: Date): string {
  const parts = manilaShortFmt.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} at ${get("hour")}:${get(
    "minute"
  )} ${get("dayPeriod")}`;
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLeaveAuditTrail, type AuditLogRow } from "@/lib/actions/audit-actions";
import { cn } from "@/lib/utils";

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  hr_admin: "HR",
  department_head: "Department Head",
  department_admin: "Department Admin",
  employee: "Employee",
};

interface EventStyle {
  icon: typeof FileText;
  label: string;
  tone: "neutral" | "success" | "danger" | "warning" | "info";
}

function eventStyle(action: string): EventStyle {
  switch (action) {
    case "create_leave":
      return { icon: FileText, label: "Filed", tone: "info" };
    case "approve_leave_dept":
      return { icon: ShieldCheck, label: "Department Approved", tone: "info" };
    case "approve_leave":
      return { icon: CheckCircle2, label: "HR Approved", tone: "success" };
    case "reject_leave_dept":
      return { icon: XCircle, label: "Department Rejected", tone: "danger" };
    case "reject_leave":
      return { icon: XCircle, label: "HR Rejected", tone: "danger" };
    case "cancel_leave":
      return { icon: Ban, label: "Cancelled", tone: "warning" };
    case "cancel_approved_leave":
      return { icon: Ban, label: "Approved Leave Cancelled", tone: "danger" };
    default:
      return { icon: Activity, label: action.replace(/_/g, " "), tone: "neutral" };
  }
}

const toneClasses: Record<EventStyle["tone"], { dot: string; icon: string; badge: string }> = {
  neutral: {
    dot: "bg-muted-foreground/40",
    icon: "text-muted-foreground bg-muted",
    badge: "bg-muted text-muted-foreground",
  },
  info: {
    dot: "bg-blue-500",
    icon: "text-blue-700 bg-blue-50",
    badge: "bg-blue-50 text-blue-700",
  },
  success: {
    dot: "bg-emerald-500",
    icon: "text-emerald-700 bg-emerald-50",
    badge: "bg-emerald-50 text-emerald-700",
  },
  danger: {
    dot: "bg-rose-500",
    icon: "text-rose-700 bg-rose-50",
    badge: "bg-rose-50 text-rose-700",
  },
  warning: {
    dot: "bg-amber-500",
    icon: "text-amber-800 bg-amber-50",
    badge: "bg-amber-50 text-amber-800",
  },
};

function describe(log: AuditLogRow): string {
  const v = (log.new_values ?? {}) as Record<string, unknown>;
  const actor =
    (log.user_profiles?.full_name as string | undefined) ??
    log.user_email ??
    "System";

  const filedByRole = v.filed_by_role as string | undefined;
  const reason = v.rejection_reason as string | undefined;
  const adjustedReason = v.reason as string | undefined;
  const cancellationReason = v.cancellation_reason as string | undefined;
  const cancelledByRole = v.cancelled_by_role as string | undefined;

  switch (log.action) {
    case "create_leave": {
      const filerRoleLabel =
        filedByRole && filedByRole !== "employee"
          ? ` (filed by ${roleLabel[filedByRole] ?? filedByRole})`
          : "";
      return `${actor} filed this leave application${filerRoleLabel}.`;
    }
    case "approve_leave_dept":
      return `${actor} approved at the department level.`;
    case "approve_leave":
      return `${actor} granted final HR approval.`;
    case "reject_leave_dept":
      return reason
        ? `${actor} rejected at the department level: "${reason}".`
        : `${actor} rejected at the department level.`;
    case "reject_leave":
      return reason
        ? `${actor} rejected at HR review: "${reason}".`
        : `${actor} rejected at HR review.`;
    case "cancel_leave":
      return `${actor} cancelled this application.`;
    case "cancel_approved_leave": {
      const roleSuffix =
        cancelledByRole && roleLabel[cancelledByRole]
          ? ` (${roleLabel[cancelledByRole]})`
          : "";
      return cancellationReason
        ? `${actor}${roleSuffix} cancelled this approved leave: "${cancellationReason}".`
        : `${actor}${roleSuffix} cancelled this approved leave.`;
    }
    default:
      return adjustedReason
        ? `${actor} performed ${log.action}: "${adjustedReason}".`
        : `${actor} performed ${log.action}.`;
  }
}

function extraDetails(log: AuditLogRow): string | null {
  const v = (log.new_values ?? {}) as Record<string, unknown>;
  if (log.action !== "create_leave") return null;

  const code = v.leave_type_code as string | undefined;
  const days = v.days_applied as number | undefined;
  const paid = v.days_with_pay as number | undefined;
  const lwop = v.days_without_pay as number | undefined;
  const parts: string[] = [];
  if (code) parts.push(code);
  if (typeof days === "number") parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (typeof paid === "number" && typeof lwop === "number" && lwop > 0) {
    parts.push(`${paid} paid / ${lwop} LWOP`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

export async function LeaveAuditTrail({ leaveId }: { leaveId: string }) {
  const events = await getLeaveAuditTrail(leaveId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity recorded for this leave application yet.
          </p>
        ) : (
          <ol className="relative ml-3 border-l border-border space-y-5">
            {events.map((log) => {
              const style = eventStyle(log.action);
              const Icon = style.icon;
              const classes = toneClasses[style.tone];
              const detail = extraDetails(log);
              const when = new Date(log.created_at);
              return (
                <li key={log.id} className="ml-4">
                  <span
                    className={cn(
                      "absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background",
                      classes.dot
                    )}
                    aria-hidden
                  />
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        classes.icon
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", classes.badge)}>
                          {style.label}
                        </Badge>
                        <span
                          className="text-xs text-muted-foreground"
                          title={`${manilaLongFmt.format(when)} (Manila)`}
                        >
                          {formatDistanceToNow(when, { addSuffix: true })} ·{" "}
                          {formatManila(when)}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{describe(log)}</p>
                      {detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
