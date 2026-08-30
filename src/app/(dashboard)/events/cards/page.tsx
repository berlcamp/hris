import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageEvents } from "@/lib/auth-helpers";
import { getEventGroupOptions } from "@/lib/actions/event-actions";
import { getSystemSettings } from "@/lib/actions/settings-actions";
import { QrCardsClient } from "@/components/events/qr-cards-client";

export default async function QrCardsPage() {
  const user = await getServerUser();
  // Printing cards mints and rotates bearer credentials. HR only.
  if (!canManageEvents(user?.roles)) redirect("/events");

  const [groups, settings] = await Promise.all([
    getEventGroupOptions(),
    getSystemSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">QR ID Cards</h1>
        <p className="text-muted-foreground text-sm">
          Printable attendance cards, ten to an A4 sheet. A card carries no photo,
          so treat it as a bearer credential — reissue rotates the code and the
          old card stops scanning.
        </p>
      </div>
      <QrCardsClient
        departments={groups.departments}
        areas={groups.areas}
        organizationName={settings.lgu_name}
      />
    </div>
  );
}
