import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { getSelectableMonths } from "@/lib/actions/dtr-actions";
import {
  canAccessDtr,
  canImportDtrDevice,
  canSelectDtrDepartment,
  isDeptScoped,
} from "@/lib/auth-helpers";
import { DahuaImportDialog } from "@/components/attendance/dahua-import-dialog";
import { DtrClient, type DtrMode } from "@/components/dtr/dtr-client";

export default async function DtrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The JO and COS managers are the only roles shut out of the module — see
  // canAccessDtr. Every other role reaches this page, and the role only decides
  // which of the three tiers they land on. See the header of
  // src/lib/actions/dtr-actions.ts — the server re-derives the same tier, so
  // this is presentation only.
  if (!canAccessDtr(user.roles)) redirect("/dashboard");

  const anyDepartment = canSelectDtrDepartment(user.roles);
  const scoped = isDeptScoped(user.role);
  const mode: DtrMode = anyDepartment
    ? "any-department"
    : scoped
      ? "own-department"
      : "personal";

  const selectableMonths = await getSelectableMonths();

  // A department-scoped user gets no picker: the server pins them to their own
  // department anyway, so offering a choice would only be a control that does
  // nothing. Everyone below that tier downloads their own DTR and needs no
  // department list at all.
  const departments = anyDepartment || scoped ? await getDepartments() : [];
  const ownDepartment = scoped
    ? (departments.find((d) => d.id === user.departmentId) ?? null)
    : null;

  const showImport = canImportDtrDevice(user.roles);

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DTR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "personal"
            ? "Download your own CSC Form 48 DTR for a month."
            : mode === "own-department"
              ? `Download a month of CSC Form 48 DTRs for everyone assigned or detailed to ${ownDepartment?.name ?? "your department"}.`
              : "Download a month of CSC Form 48 DTRs for everyone assigned or detailed to a department."}
        </p>
      </div>
      {showImport && <DahuaImportDialog />}
    </div>
  );

  if (scoped && !ownDepartment) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm text-muted-foreground">
          Your account is not assigned to a department yet, so there is no
          roster to generate. Ask an administrator to set your department.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <DtrClient
        mode={mode}
        departments={mode === "any-department" ? departments : []}
        lockedDepartment={ownDepartment}
        selectableMonths={selectableMonths}
      />
    </div>
  );
}
