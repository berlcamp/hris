import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { hasRole } from "@/lib/auth-helpers";
import { getCscTeamRoster } from "@/lib/actions/csc-team-actions";
import { CscTeamManager } from "@/components/admin/csc-team-manager";

export default async function CscTeamsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  // Super Admin only — the same check every action in csc-team-actions makes.
  if (!hasRole(user.roles, "super_admin")) redirect("/dashboard");

  const { members, teams } = await getCscTeamRoster();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CSC Team Members</h1>
        <p className="text-muted-foreground text-sm">
          Assign the active workforce — Plantilla, Temporary, Job Order and COS —
          to their CSC anniversary teams. Event attendance summaries read these
          assignments live, so a correction here shows up in the totals at once.
        </p>
      </div>
      <CscTeamManager members={members} teams={teams} />
    </div>
  );
}
