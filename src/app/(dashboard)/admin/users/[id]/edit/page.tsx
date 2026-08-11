import { notFound } from "next/navigation";
import { UserForm } from "@/components/forms/user-form";
import { getUserById, getDepartments } from "@/lib/actions/user-actions";
import type { UserFormValues } from "@/lib/validations/user-schema";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, departments] = await Promise.all([
    getUserById(id).catch(() => null),
    getDepartments(),
  ]);

  if (!user) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit User</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update {user.full_name}&apos;s profile and access settings.
        </p>
      </div>

      <UserForm
        departments={departments ?? []}
        mode="edit"
        defaultValues={{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          // Cast to the schema's own role union rather than a hand-written
          // subset: the previous literal list predated jo_manager/cos_manager
          // (and ocm_admin, hr_record_manager, dtr_manager), so it read as if
          // those accounts could not be edited here — they can, and the payroll
          // switch below is theirs.
          role: user.role as UserFormValues["role"],
          department_id: user.department_id,
          is_active: user.is_active ?? true,
          can_access_attendance_corrections:
            user.can_access_attendance_corrections ?? true,
          can_manage_module_payroll: user.can_manage_module_payroll ?? true,
        }}
      />
    </div>
  );
}
