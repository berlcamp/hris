import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import {
  getLeaveCreditsForYear,
  getLeaveTypes,
  provisionAllActiveEmployees,
} from "@/lib/actions/leave-actions";
import { LeaveCreditAdjustmentDialog } from "@/components/leaves/leave-credit-adjustment-dialog";
import { ProvisionButton } from "@/components/leaves/provision-button";

export default async function LeaveCreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const currentYear = new Date().getFullYear();
  const isAdmin = ["super_admin", "hr_admin"].includes(user.role);

  const [credits, leaveTypes] = await Promise.all([
    getLeaveCreditsForYear(currentYear),
    getLeaveTypes(),
  ]);

  // Group credits by employee
  const grouped = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      employeeNo: string;
      department: string;
      credits: typeof credits;
    }
  >();

  for (const c of credits) {
    const emp = c.employees;
    if (!emp) continue;
    const key = c.employee_id;
    if (!grouped.has(key)) {
      const dept = Array.isArray(emp.departments) ? emp.departments[0] : emp.departments;
      grouped.set(key, {
        employeeId: key,
        employeeName: `${emp.last_name}, ${emp.first_name}`,
        employeeNo: emp.employee_no,
        department: dept?.name ?? "—",
        credits: [],
      });
    }
    grouped.get(key)!.credits.push(c);
  }

  const rows = Array.from(grouped.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName)
  );

  // Unique leave type columns (VL, SL are the main ones)
  const mainLeaveTypes = leaveTypes.filter((lt) => ["VL", "SL"].includes(lt.code));

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
          <ProvisionButton year={currentYear} />
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No leave credits found for {currentYear}. Use &quot;Provision Credits&quot; to auto-generate credits for all active employees.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  {mainLeaveTypes.map((lt) => (
                    <TableHead key={lt.id} className="text-center">{lt.code}</TableHead>
                  ))}
                  <TableHead className="text-center">Other</TableHead>
                  {isAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const otherCredits = row.credits.filter(
                    (c) => !mainLeaveTypes.some((lt) => lt.id === c.leave_type_id)
                  );
                  const otherBalance = otherCredits.reduce(
                    (sum, c) => sum + Number(c.balance),
                    0
                  );

                  return (
                    <TableRow key={row.employeeId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.employeeName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {row.employeeNo}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.department}</TableCell>
                      {mainLeaveTypes.map((lt) => {
                        const credit = row.credits.find((c) => c.leave_type_id === lt.id);
                        return (
                          <TableCell key={lt.id} className="text-center">
                            {credit ? (
                              <div>
                                <span className="font-semibold">{Number(credit.balance)}</span>
                                <span className="text-xs text-muted-foreground">
                                  /{Number(credit.total_credits)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        {otherBalance > 0 ? (
                          <Badge variant="outline">{otherBalance}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <LeaveCreditAdjustmentDialog
                            employeeId={row.employeeId}
                            employeeName={row.employeeName}
                            leaveTypes={leaveTypes}
                            year={currentYear}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
