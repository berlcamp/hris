import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  getLeaveCreditsForYear,
  getLeaveTypes,
} from "@/lib/actions/leave-actions";
import { MonthlyAccrualDialog } from "@/components/leaves/monthly-accrual-dialog";
import { ProvisionButton } from "@/components/leaves/provision-button";
import { FlagAllVlSlButton } from "@/components/leaves/flag-all-vl-sl-button";
import { LeaveCreditsTable } from "@/components/leaves/leave-credits-table";
import type { LeaveCreditTableRow } from "@/components/tables/columns/leave-credit-columns";

export default async function LeaveCreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/dashboard");

  const currentYear = new Date().getFullYear();
  const isAdmin = true;

  const [credits, leaveTypes] = await Promise.all([
    getLeaveCreditsForYear(currentYear),
    getLeaveTypes(),
  ]);

  const vlId = leaveTypes.find((lt) => lt.code === "VL")?.id;
  const slId = leaveTypes.find((lt) => lt.code === "SL")?.id;

  const grouped = new Map<string, LeaveCreditTableRow>();

  for (const c of credits) {
    const emp = c.employees;
    if (!emp) continue;
    const key = c.employee_id;
    if (!grouped.has(key)) {
      const dept = Array.isArray(emp.departments)
        ? emp.departments[0]
        : emp.departments;
      grouped.set(key, {
        employeeId: key,
        employeeName: `${emp.last_name}, ${emp.first_name}`,
        employeeNo: String(emp.biometric_no),
        department: dept?.name ?? "—",
        vl: null,
        sl: null,
        otherBalance: 0,
        needsManualEntry: Boolean(emp.vl_sl_needs_manual_entry),
      });
    }
    const row = grouped.get(key)!;
    const balance = Number(c.balance);
    const total = Number(c.total_credits);
    if (c.leave_type_id === vlId) {
      row.vl = { balance, total };
    } else if (c.leave_type_id === slId) {
      row.sl = { balance, total };
    } else {
      row.otherBalance += balance;
    }
  }

  const rows = Array.from(grouped.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Credits</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage leave credit balances for {currentYear}.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <FlagAllVlSlButton />
            <MonthlyAccrualDialog />
            <ProvisionButton year={currentYear} />
          </div>
        )}
      </div>

      <LeaveCreditsTable
        rows={rows}
        leaveTypes={leaveTypes}
        isAdmin={isAdmin}
        year={currentYear}
      />
    </div>
  );
}
