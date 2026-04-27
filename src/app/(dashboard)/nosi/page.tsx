import Link from "next/link";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NosiRecordsDataTable } from "@/components/nosi/nosi-records-data-table";
import {
  getEligibleForNosi,
  getNosisRecords,
  getUpcomingNosiIncrements,
} from "@/lib/actions/nosi-actions";
import { getCurrentUser } from "@/lib/actions/auth-actions";
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
import { format } from "date-fns";

const UPCOMING_DAYS_AHEAD = 30;

export default async function NosiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "employee") redirect("/dashboard");

  const [eligible, upcoming, records] = await Promise.all([
    getEligibleForNosi(),
    getUpcomingNosiIncrements(UPCOMING_DAYS_AHEAD),
    getNosisRecords(),
  ]);

  const canCreate = ["super_admin", "hr_admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NOSI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notice of Step Increment — manage salary step increases for eligible employees.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/nosi/new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Generate NOSI
          </Link>
        )}
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
                          <p className="font-medium">{emp.last_name}, {emp.first_name}</p>
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
                No employees are due for a step increment in the next {UPCOMING_DAYS_AHEAD} days.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Employees whose next step increment becomes due within{" "}
                  {UPCOMING_DAYS_AHEAD} days.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Current SG/Step</TableHead>
                      <TableHead>Next Step</TableHead>
                      <TableHead>Eligible On</TableHead>
                      <TableHead>In</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <p className="font-medium">
                            {emp.last_name}, {emp.first_name}
                          </p>
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
                        <TableCell>Step {emp.step_increment + 1}</TableCell>
                        <TableCell>
                          {format(new Date(emp.eligibility_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {emp.days_until_eligibility}{" "}
                            {emp.days_until_eligibility === 1 ? "day" : "days"}
                          </Badge>
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
