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
          // `roles` is the source of truth (migration 087); `role` is only its
          // derived primary. Falling back to the scalar keeps a row written
          // before that migration editable rather than opening with no roles
          // ticked and quietly narrowing the account on save.
          roles: (user.roles?.length
            ? user.roles
            : [user.role]) as UserFormValues["roles"],
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
