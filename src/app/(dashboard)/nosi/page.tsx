import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NosiRecordsDataTable } from "@/components/nosi/nosi-records-data-table";
import { NosiUpcomingTab } from "@/components/nosi/nosi-upcoming-tab";
import {
  getNosiEligibilityOverview,
  getNosisRecords,
} from "@/lib/actions/nosi-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageHrRecords } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { differenceInCalendarDays, endOfYear, format, startOfDay } from "date-fns";

// Load upcoming increments through the end of next year so the in-tab "due
// within" filter (1/3/6 months, rest of this year, or all of next year) can
// narrow client-side without refetching.
function daysThroughEndOfNextYear(): number {
  const today = startOfDay(new Date());
  const endNextYear = endOfYear(new Date(today.getFullYear() + 1, 0, 1));
  return differenceInCalendarDays(endNextYear, today);
}

export default async function NosiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageHrRecords(user.role)) redirect("/dashboard");

  const [{ eligible, upcoming, missingNosiBasis }, records] = await Promise.all([
    getNosiEligibilityOverview(daysThroughEndOfNextYear()),
    getNosisRecords(),
  ]);

  const canCreate = canManageHrRecords(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">NOSI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Notice of Step Increment — manage salary step increases for eligible employees.
          Eligibility uses salary history only (a row with reason such as step_increment or initial).
        </p>
      </div>

      <Tabs defaultValue="eligible">
        <TabsList>
          <TabsTrigger value="eligible">
            Eligible Employees
            {eligible.length > 0 && (
              <Badge variant="secondary" className="ml-2">{eligible.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            Upcoming Increments
            {upcoming.length > 0 && (
              <Badge variant="secondary" className="ml-2">{upcoming.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing-basis">
            Missing salary basis
            {missingNosiBasis.length > 0 && (
              <Badge variant="secondary" className="ml-2">{missingNosiBasis.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="records">NOSI Records</TabsTrigger>
        </TabsList>

        <TabsContent value="eligible" className="mt-4">
          {eligible.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No employees are currently eligible for step increment.
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
                      <TableHead>Position</TableHead>
                      <TableHead>Current SG/Step</TableHead>
                      <TableHead>New Step</TableHead>
                      <TableHead>Last Increment</TableHead>
                      <TableHead>Years in Step</TableHead>
                      {canCreate && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligible.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <Link
                            href={`/employees/${emp.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {emp.last_name}, {emp.first_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {emp.departments ? (
                            <span>
                              <span className="font-mono text-xs text-muted-foreground mr-1">{emp.departments.code}</span>
                              {emp.departments.name}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{emp.positions?.title ?? "—"}</TableCell>
                        <TableCell>SG {emp.salary_grade} — Step {emp.step_increment}</TableCell>
                        <TableCell>Step {emp.step_increment + 1}</TableCell>
                        <TableCell>
                          {emp.last_increment_date
                            ? format(new Date(emp.last_increment_date), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{emp.years_in_step} yrs</Badge>
                        </TableCell>
                        {canCreate && (
                          <TableCell>
                            <Link
                              href={`/nosi/new?employee_id=${emp.id}`}
                              className="text-sm text-primary hover:underline"
                            >
                              Generate
                            </Link>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No employees are due for a step increment within the current year.
              </CardContent>
            </Card>
          ) : (
            <NosiUpcomingTab upcoming={upcoming} />
          )}
        </TabsContent>

        <TabsContent value="missing-basis" className="mt-4">
          {missingNosiBasis.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                All active plantilla employees have at least one salary history row that establishes
                a NOSI basis (e.g. initial, step_increment, promotion).
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  These employees are not at step 8 but have no qualifying row in{" "}
                  <span className="font-mono text-xs">salary_history</span> for NOSI (reasons such as{" "}
                  <span className="font-mono text-xs">initial</span>,{" "}
                  <span className="font-mono text-xs">step_increment</span>,{" "}
                  <span className="font-mono text-xs">promotion</span>, etc.). Add or import salary
                  history before they can appear under Eligible or Upcoming.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Current SG/Step</TableHead>
                      <TableHead>Salary history</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missingNosiBasis.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <Link
                            href={`/employees/${emp.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {emp.last_name}, {emp.first_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {emp.departments ? (
                            <span>
                              <span className="font-mono text-xs text-muted-foreground mr-1">
                                {emp.departments.code}
                              </span>
                              {emp.departments.name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{emp.positions?.title ?? "—"}</TableCell>
                        <TableCell>
                          SG {emp.salary_grade} — Step {emp.step_increment}
                        </TableCell>
                        <TableCell>
                          {!emp.has_salary_history ? (
                            <Badge variant="destructive">None</Badge>
                          ) : (
                            <Badge variant="secondary">No basis row</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          <NosiRecordsDataTable
            data={records ?? []}
            canDeleteDraft={canCreate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
