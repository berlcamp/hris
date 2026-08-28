import type { Viewport } from "next";
import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canScanEvents } from "@/lib/auth-helpers";

/**
 * Shell for the Attendance Checker app — deliberately OUTSIDE the (dashboard)
 * layout.
 *
 * These are the only pages in this application a service worker caches, and the
 * dashboard layout renders the signed-in user's name, avatar and role into its
 * sidebar. Caching that HTML would hand one user's identity to whoever opens
 * the app next on a shared phone. Nothing user-specific may be rendered here or
 * in any page beneath it: the officer's own view is built on the client from
 * IndexedDB.
 *
 * The auth check still runs — it just redirects rather than rendering.
 */
export const viewport: Viewport = {
  themeColor: "#151b26",
  // The app runs full screen on a notched phone; every screen beneath this pads
  // itself back off the notch and the home indicator with env(safe-area-inset-*).
  viewportFit: "cover",
  // A door is no place to discover you have pinch-zoomed the viewfinder.
  maximumScale: 1,
};

export default async function ScannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!canScanEvents(user?.role)) redirect("/dashboard");

  // .checker-shell carries this app's own dark palette (src/app/globals.css).
  // Scoping it to a wrapper rather than the <html> element is what lets every
  // shadcn primitive inside render dark while the rest of the HRIS stays light.
  return (
    <div className="checker-shell min-h-svh antialiased">{children}</div>
  );
}
