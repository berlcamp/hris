import { CheckerHomeClient } from "@/components/events/checker-home-client";

/**
 * The Attendance Checker's home screen — the app's start_url, and the screen
 * an officer lands on straight after signing in with Google.
 *
 * Renders NOTHING from the server. Every byte the officer sees — the open
 * events, their counts, the unsent queue — is read on the client, so the HTML
 * the service worker caches on a possibly shared phone is free of personnel
 * data. See (scanner)/layout.tsx.
 */
export default function ScanHomePage() {
  return <CheckerHomeClient />;
}
