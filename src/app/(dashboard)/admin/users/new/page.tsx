import { UserForm } from "@/components/forms/user-form";
import { getDepartments } from "@/lib/actions/user-actions";

export default async function NewUserPage() {
  const departments = await getDepartments();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New User</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new user profile. They can sign in with this email via Google
          OAuth.
        </p>
      </div>

      <UserForm departments={departments ?? []} mode="create" />
    </div>
  );
}
