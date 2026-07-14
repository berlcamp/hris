import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getVacancyById } from "@/lib/actions/rsp-actions";
import { getSystemSettings } from "@/lib/actions/settings-actions";
import { computeRanking } from "@/lib/rsp-ranking";
import {
  VACANCY_STATUS_LABELS,
  VACANCY_STATUS_VARIANT,
  isVacancyExpired,
} from "@/lib/rsp-constants";
import { PublishVacancyDialog } from "@/components/rsp/publish-vacancy-dialog";
import { VacancyActions } from "@/components/rsp/vacancy-actions";
import { VacancyOverviewTab } from "@/components/rsp/vacancy-overview-tab";
import { ApplicationsTab } from "@/components/rsp/applications-tab";
import { AssessmentTab } from "@/components/rsp/assessment-tab";
import { AppointmentTab } from "@/components/rsp/appointment-tab";

export default async function VacancyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const { id } = await params;

  let vacancy;
  try {
    vacancy = await getVacancyById(id);
  } catch {
    notFound();
  }
  const settings = await getSystemSettings();

  const ranking = computeRanking(
    vacancy.rsp_applications,
    vacancy.rsp_assessment_criteria
  );
  const expired = isVacancyExpired(vacancy);
  const applications = vacancy.rsp_applications;
  const qualifiedCount = applications.filter((a) =>
    ["qualified", "selected"].includes(a.status)
  ).length;
  const appointment =
    vacancy.rsp_appointments.find((a) => a.status === "issued") ??
    vacancy.rsp_appointments[0] ??
    null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/rsp"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to vacancies
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {vacancy.position_title}
            </h1>
            <Badge variant={VACANCY_STATUS_VARIANT[vacancy.status]}>
              {VACANCY_STATUS_LABELS[vacancy.status]}
            </Badge>
            {expired && <Badge variant="destructive">Publication Expired</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Item {vacancy.item_number}
            {vacancy.organizational_unit
              ? ` · ${vacancy.organizational_unit}`
              : ""}
            {vacancy.salary_grade ? ` · SG ${vacancy.salary_grade}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {["draft", "published"].includes(vacancy.status) && (
            <Link href={`/rsp/${vacancy.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {vacancy.status === "draft" && (
            <PublishVacancyDialog vacancyId={vacancy.id} />
          )}
          <VacancyActions vacancy={vacancy} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview &amp; QS</TabsTrigger>
          <TabsTrigger value="applications">
            Applications ({applications.length})
          </TabsTrigger>
          <TabsTrigger value="assessment">
            Assessment &amp; Ranking ({qualifiedCount})
          </TabsTrigger>
          <TabsTrigger value="appointment">Appointment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <VacancyOverviewTab vacancy={vacancy} settings={settings} />
        </TabsContent>
        <TabsContent value="applications">
          <ApplicationsTab vacancy={vacancy} />
        </TabsContent>
        <TabsContent value="assessment">
          <AssessmentTab vacancy={vacancy} ranking={ranking} settings={settings} />
        </TabsContent>
        <TabsContent value="appointment">
          <AppointmentTab
            vacancy={vacancy}
            ranking={ranking}
            appointment={appointment}
            settings={settings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
