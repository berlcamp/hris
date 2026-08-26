import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canScanEvents } from "@/lib/auth-helpers";

/**
 * Bare shell for the event scanner — deliberately OUTSIDE the (dashboard)
 * layout.
 *
 * The scanner is the one page in this application a service worker caches, and
 * the dashboard layout renders the signed-in user's name, avatar and role into
 * its sidebar. Caching that HTML would hand one user's identity to whoever
 * opens the scanner next on a shared phone. Nothing user-specific may be
 * rendered here or in any page beneath it: the officer's own view is built on
 * the client from IndexedDB.
 *
 * The auth check still runs — it just redirects rather than rendering.
 */
export default async function ScannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!canScanEvents(user?.role)) redirect("/dashboard");

  return <div className="bg-background min-h-svh">{children}</div>;
}
