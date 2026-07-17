import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  Pencil,
  User,
  Briefcase,
  DollarSign,
  FileText,
  FolderOpen,
  Calendar,
  ClipboardList,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  getEmployeeById,
  getSalaryHistory,
  getLeaveCredits,
  getServiceRecords,
} from "@/lib/actions/employee-actions";
import { getDocuments } from "@/lib/actions/document-actions";
import { getPlantillaByEmployee } from "@/lib/actions/plantilla-actions";
import {
  getLeaveTypes,
  getLeaveLedger,
  getLeaveCreditAdjustments,
  getLeaveAccrualHistory,
} from "@/lib/actions/leave-actions";
import { PersonalInfoTab } from "@/components/employees/personal-info-tab";
import { EmploymentTab } from "@/components/employees/employment-tab";
import { SalaryHistoryTab } from "@/components/employees/salary-history-tab";
import { ServiceRecordTab } from "@/components/employees/service-record-tab";
import { DocumentsTab } from "@/components/employees/documents-tab";
import { LeaveCreditsTab } from "@/components/employees/leave-credits-tab";
import { PlantillaTab } from "@/components/employees/plantilla-tab";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageHrRecords } from "@/lib/auth-helpers";
import { getEffectivePosition } from "@/lib/employee-position";
import { buildEmployeeQrUrl, generateEmployeeQrDataUrl } from "@/lib/employee-qr";
import { EmployeeQrButton } from "@/components/employees/employee-qr-button";

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const currentYear = new Date().getFullYear();
  const [
    employee,
    salaryHistory,
    leaveCredits,
    leaveTypes,
    leaveLedger,
    leaveAdjustments,
    leaveAccrualHistory,
    serviceRecords,
    documents,
    currentUser,
  ] = await Promise.all([
    getEmployeeById(id).catch(() => null),
    getSalaryHistory(id),
    getLeaveCredits(id),
    getLeaveTypes(),
    getLeaveLedger(id, currentYear),
    getLeaveCreditAdjustments(id, currentYear),
    getLeaveAccrualHistory(id, currentYear),
    getServiceRecords(id),
    getDocuments(id),
    getCurrentUser(),
  ]);

  const plantilla =
    employee?.employment_type === "plantilla"
      ? await getPlantillaByEmployee(id)
      : null;

  // super_admin / hr_admin only. Drives the leave-credit admin actions and the
  // service-record PDF (deliberately kept off the HR Record Manager).
  const isHrAdmin = ["super_admin", "hr_admin"].includes(currentUser?.role ?? "");
  // super_admin / hr_admin / hr_record_manager — the HR records reach: edit the
  // employee, manage salary history and plantilla, and view the QR code.
  const canManageRecords = canManageHrRecords(currentUser?.role);
  const canManageSalaryHistory = canManageRecords;
  const canEditEmployee = canManageRecords;

  if (!employee) notFound();

  const qrUrl = buildEmployeeQrUrl(employee.id);
  const qrDataUrl = canManageRecords
    ? await generateEmployeeQrDataUrl(employee.id)
    : null;

  const fullName = [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
    employee.suffix,
  ]
    .filter(Boolean)
    .join(" ");

  const initials = `${employee.first_name.charAt(0)}${employee.last_name.charAt(0)}`;

  const employmentTypeLabels: Record<string, string> = {
    plantilla: "Plantilla",
    jo: "Job Order",
    cos: "Contract of Service",
  };

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "secondary",
    inactive: "destructive",
    retired: "outline",
    terminated: "destructive",
    resigned: "outline",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-sm text-muted-foreground">
                {employee.biometric_no}
              </span>
              <Separator orientation="vertical" className="h-4" />
              <Badge
                variant={
                  employmentTypeLabels[employee.employment_type]
                    ? "default"
                    : "outline"
                }
              >
                {employmentTypeLabels[employee.employment_type] ??
                  employee.employment_type}
              </Badge>
              <Badge variant={statusVariant[employee.status] ?? "outline"}>
                {employee.status.charAt(0).toUpperCase() +
                  employee.status.slice(1)}
              </Badge>
            </div>
            {(() => {
              const positionTitle = getEffectivePosition(employee);
              if (!positionTitle && !employee.departments) return null;
              return (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {positionTitle}
                  {positionTitle && employee.departments && " — "}
                  {employee.departments?.name}
                </p>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageRecords && qrDataUrl && (
            <EmployeeQrButton
              employeeName={fullName}
              url={qrUrl}
              qrDataUrl={qrDataUrl}
            />
          )}
          {canEditEmployee && (
            <Link href={`/employees/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="personal">
            <User className="h-4 w-4 mr-1.5" />
            Personal Info
          </TabsTrigger>
          <TabsTrigger value="employment">
            <Briefcase className="h-4 w-4 mr-1.5" />
            Employment
          </TabsTrigger>
          <TabsTrigger value="salary">
            <DollarSign className="h-4 w-4 mr-1.5" />
            Salary History
          </TabsTrigger>
          <TabsTrigger value="service">
            <FileText className="h-4 w-4 mr-1.5" />
            Service Record
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FolderOpen className="h-4 w-4 mr-1.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="leave">
            <Calendar className="h-4 w-4 mr-1.5" />
            Leave Credits
          </TabsTrigger>
          {plantilla && (
            <TabsTrigger value="plantilla">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Plantilla
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="personal">
          <PersonalInfoTab employee={employee} />
        </TabsContent>

        <TabsContent value="employment">
          <EmploymentTab employee={employee} />
        </TabsContent>

        <TabsContent value="salary">
          <SalaryHistoryTab
            salaryHistory={salaryHistory ?? []}
            employeeId={id}
            canManage={canManageSalaryHistory}
            defaultSalaryGrade={employee.salary_grade}
            defaultStep={employee.step_increment}
          />
        </TabsContent>

        <TabsContent value="service">
          <ServiceRecordTab
            serviceRecords={serviceRecords ?? []}
            employeeId={id}
            employeeName={fullName}
            canGeneratePdf={isHrAdmin}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab
            documents={documents ?? []}
            employeeId={id}
          />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveCreditsTab
            leaveCredits={leaveCredits ?? []}
            ledger={leaveLedger ?? []}
            adjustments={leaveAdjustments ?? []}
            accrualHistory={leaveAccrualHistory ?? []}
            ledgerYear={currentYear}
            employeeId={id}
            employeeName={fullName}
            leaveTypes={leaveTypes}
            isAdmin={isHrAdmin}
            needsManualEntry={Boolean(employee.vl_sl_needs_manual_entry)}
          />
        </TabsContent>

        {plantilla && (
          <TabsContent value="plantilla">
            <PlantillaTab
              plantilla={plantilla}
              employeeId={id}
              canEdit={canManageRecords}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
