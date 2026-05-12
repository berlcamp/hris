"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Pencil, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeEmployeeStatus } from "@/lib/actions/employee-actions";
import {
  EMPLOYEE_STATUS_DESCRIPTIONS,
  EMPLOYEE_STATUS_LABELS,
} from "@/lib/constants";
import { useUser } from "@/hooks/use-user";
import type { EmployeeStatus } from "@/lib/types";
import type { EmployeeRow } from "./employee-columns";

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "active", label: EMPLOYEE_STATUS_LABELS.active },
  { value: "inactive", label: EMPLOYEE_STATUS_LABELS.inactive },
  { value: "retired", label: EMPLOYEE_STATUS_LABELS.retired },
  { value: "resigned", label: EMPLOYEE_STATUS_LABELS.resigned },
  { value: "terminated", label: EMPLOYEE_STATUS_LABELS.terminated },
  { value: "suspended", label: EMPLOYEE_STATUS_LABELS.suspended },
  { value: "awol", label: EMPLOYEE_STATUS_LABELS.awol },
  { value: "dropped", label: EMPLOYEE_STATUS_LABELS.dropped },
  { value: "deceased", label: EMPLOYEE_STATUS_LABELS.deceased },
];

export function EmployeeActionsCell({ employee }: { employee: EmployeeRow }) {
  const router = useRouter();
  const { user } = useUser();
  const canEdit =
    !!user && ["super_admin", "hr_admin"].includes(user.role);
  const [showStatus, setShowStatus] = useState(false);
  const [status, setStatus] = useState<EmployeeStatus>(
    (employee.status as EmployeeStatus) ?? "active"
  );
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const fullName = [employee.first_name, employee.last_name]
    .filter(Boolean)
    .join(" ");

  const openStatusDialog = () => {
    setStatus((employee.status as EmployeeStatus) ?? "active");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setRemarks("");
    setShowStatus(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await changeEmployeeStatus({
      id: employee.id,
      status,
      effective_date: status === "active" ? null : effectiveDate || null,
      remarks: status === "active" ? null : remarks.trim() || null,
    });

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(
        `${fullName} is now ${EMPLOYEE_STATUS_LABELS[status] ?? status}.`
      );
      setShowStatus(false);
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/employees/${employee.id}`)}
          >
            <Eye className="h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => router.push(`/employees/${employee.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openStatusDialog}>
                <UserCog className="h-4 w-4" />
                Change status
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showStatus} onOpenChange={setShowStatus}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Employee Status</DialogTitle>
            <DialogDescription>
              Update <strong>{fullName}</strong>&apos;s employment status. Only{" "}
              <em>Active</em> employees participate in leave accrual, payroll,
              and dashboard counts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">New status</Label>
              <Select
                value={status}
                items={STATUS_OPTIONS.map((s) => ({
                  value: s.value,
                  label: s.label,
                }))}
                onValueChange={(val) => setStatus(val as EmployeeStatus)}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {EMPLOYEE_STATUS_DESCRIPTIONS[status]}
              </p>
            </div>

            {status !== "active" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="effective_date">Effective date</Label>
                  <Input
                    id="effective_date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remarks">
                    Remarks{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="remarks"
                    rows={3}
                    placeholder="Memo / order ref. or legal basis"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
