import { notFound, redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageEvents } from "@/lib/auth-helpers";
import {
  getEvent,
  getEventAttendance,
  getEventGroupOptions,
  getEventRoster,
} from "@/lib/actions/event-actions";
import { EventDetailClient } from "@/components/events/event-detail-client";

export default async function EventDetailPage({
  params,
}: {
  // Next 16: params is async — await before destructuring.
  params: Promise<{ id: string }>;
}) {
  const user = await getServerUser();
  // The Attendance Checker is scan-only: this page carries the roster and
  // the attendance report, neither of which is theirs to see.
  if (!canManageEvents(user?.role)) redirect("/events");

  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [roster, attendance, groups] = await Promise.all([
    getEventRoster(id),
    getEventAttendance(id),
    getEventGroupOptions(),
  ]);

  return (
    <EventDetailClient
      event={event}
      roster={roster}
      attendance={attendance}
      departments={groups.departments}
      areas={groups.areas}
      orphanedLegacyCount={groups.orphanedLegacyCount}
      canDelete={user?.role === "super_admin"}
    />
  );
}
