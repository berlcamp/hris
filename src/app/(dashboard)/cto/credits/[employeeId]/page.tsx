import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

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
import { cn } from "@/lib/utils";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getEmployeeCtoLedger } from "@/lib/actions/cto-actions";
import { getHolidays } from "@/lib/actions/holiday-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { manilaToday, CTO_MAX_BALANCE } from "@/lib/cto-helpers";
import { CtoCreditEntryDialog } from "@/components/cto/cto-credit-entry-dialog";
import { CtoVoidCreditDialog } from "@/components/cto/cto-void-credit-dialog";
import { CocCertificatePdfButton } from "@/components/cto/coc-certificate-pdf-button";

const dayTypeLabel: Record<string, string> = {
  regular: "Regular",
  rest_day: "Rest day",
  holiday: "Holiday",
};

function fmt(d: string) {
  return format(new Date(d + "T00:00:00"), "MMM d, yyyy");
}

export default async function CtoEmployeeLedgerPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) {
    redirect("/dashboard");
  }

  const supabase = createAdminClient();
  const { data: employee } = await supabase
    .schema("hris")
    .from("employees")
    .select(
      "id, first_name, last_name, middle_name, suffix, biometric_no, departments!employees_department_id_fkey(name, code), positions(title), plantilla(position_title)"
    )
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) notFound();

  const [ledger, holidays] = await Promise.all([
    getEmployeeCtoLedger(employeeId),
    getHolidays(),
  ]);
  if ("error" in ledger) notFound();

  const { credits, approvedApplications, balance } = ledger;
  const remainingById = new Map(balance.perEarn.map((e) => [e.id, e.remaining]));
  const today = manilaToday();
  const employeeName = `${employee.last_name}, ${employee.first_name}`;

  const activeCredits = credits.filter((c) => !c.voided_at);
  const totalEarned = activeCredits.reduce((acc, c) => acc + Number(c.hours_earned), 0);
  const totalUsed = approvedApplications.reduce(
    (acc, a) => acc + Number(a.hours_applied),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cto/credits">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employeeName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              COC ledger — earned overtime credits, usage, expiry, and forfeiture.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <CocCertificatePdfButton
            employee={{
              first_name: employee.first_name,
              last_name: employee.last_name,
              middle_name: employee.middle_name,
              suffix: employee.suffix,
              department:
                (Array.isArray(employee.departments)
                  ? employee.departments[0]
                  : employee.departments
                )?.name ?? null,
              position:
                employee.plantilla?.[0]?.position_title ??
                (Array.isArray(employee.positions)
                  ? employee.positions[0]
                  : employee.positions
                )?.title ??
                null,
            }}
            credits={activeCredits.map((c) => ({
              ot_date: c.ot_date,
              day_type: c.day_type,
              hours_worked: Number(c.hours_worked),
              multiplier: Number(c.multiplier),
              hours_earned: Number(c.hours_earned),
              expiry_date: c.expiry_date,
              office_order_no: c.office_order_no,
            }))}
            available={balance.available}
          />
          <CtoCreditEntryDialog
            employees={[]}
            holidayDates={holidays.map((h) => h.date)}
            fixedEmployeeId={employee.id}
            fixedEmployeeName={employeeName}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="text-xl font-semibold">{balance.available}h</p>
            <p className="text-xs text-muted-foreground">of max {CTO_MAX_BALANCE}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total earned</p>
            <p className="text-xl font-semibold">{totalEarned}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Used (approved CTO)</p>
            <p className="text-xl font-semibold">{totalUsed}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Expiring ≤30 days</p>
            <p
              className={cn(
                "text-xl font-semibold",
                balance.expiringSoon > 0 && "text-amber-700 dark:text-amber-500"
              )}
            >
              {balance.expiringSoon}h
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Forfeited (expired)</p>
            <p className="text-xl font-semibold">{balance.expiredForfeited}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Earn entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">COC Earned</CardTitle>
        </CardHeader>
        <CardContent>
          {credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No COC entries recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OT Date</TableHead>
                  <TableHead>Day Type</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Authority / Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.map((c) => {
                  const voided = !!c.voided_at;
                  const remaining = voided ? 0 : remainingById.get(c.id) ?? 0;
                  const expired = !voided && c.expiry_date < today;
                  return (
                    <TableRow key={c.id} className={cn(voided && "opacity-60")}>
                      <TableCell className="font-medium">{fmt(c.ot_date)}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {dayTypeLabel[c.day_type] ?? c.day_type}{" "}
                          <span className="text-xs text-muted-foreground">
                            ×{Number(c.multiplier)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm">
                          {Number(c.hours_worked)}h → {Number(c.hours_earned)}h
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {voided ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "text-sm font-medium",
                              expired && remaining > 0 && "text-muted-foreground line-through"
                            )}
                          >
                            {remaining}h
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-sm", expired && "text-muted-foreground")}>
                            {fmt(c.expiry_date)}
                          </span>
                          {voided && <Badge variant="destructive" className="text-xs">Voided</Badge>}
                          {expired && remaining > 0 && (
                            <Badge variant="outline" className="text-xs">Forfeited</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="text-xs text-muted-foreground truncate" title={c.notes ?? undefined}>
                          {c.office_order_no ?? ""}
                          {c.office_order_no && c.notes ? " — " : ""}
                          {voided ? `Voided: ${c.void_reason}` : c.notes ?? ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        {!voided && (
                          <CtoVoidCreditDialog
                            creditId={c.id}
                            description={`the ${Number(c.hours_earned)}h COC entry dated ${fmt(c.ot_date)}`}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approved usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approved CTO Availments</CardTitle>
        </CardHeader>
        <CardContent>
          {approvedApplications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No approved CTO applications yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedApplications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {fmt(a.start_date)}
                      {a.end_date !== a.start_date && <> – {fmt(a.end_date)}</>}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({a.cto_dates.length} working day{a.cto_dates.length === 1 ? "" : "s"})
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{Number(a.hours_applied)}h</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/cto/${a.id}`} className="text-xs hover:underline">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
