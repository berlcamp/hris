import { notFound } from "next/navigation";
import { UserForm } from "@/components/forms/user-form";
import { getUserById, getDepartments } from "@/lib/actions/user-actions";

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
          role: user.role as "hr_admin" | "department_head" | "employee",
          department_id: user.department_id,
          is_active: user.is_active ?? true,
        }}
      />
    </div>
  );
}
