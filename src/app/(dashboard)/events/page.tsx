import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canAccessEvents, canManageEvents } from "@/lib/auth-helpers";
import { getEvents } from "@/lib/actions/event-actions";
import { EventListClient } from "@/components/events/event-list-client";
import type { EventStatus } from "@/lib/types";

export default async function EventsPage({
  searchParams,
}: {
  // Next 16: searchParams is async — await before destructuring.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  if (!canAccessEvents(user?.roles)) redirect("/dashboard");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const { rows, totalCount } = await getEvents({
    page: Number(one("page") ?? "1") || 1,
    status: (one("status") ?? "all") as EventStatus | "all",
    search: one("q") ?? null,
  });

  const canManage = canManageEvents(user?.roles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-muted-foreground text-sm">
          {canManage
            ? "Events requiring attendance from Plantilla, Job Order and COS personnel."
            : "Open events you can record attendance for."}
        </p>
      </div>
      <EventListClient events={rows} totalCount={totalCount} canManage={canManage} />
    </div>
  );
}
