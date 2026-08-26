import { EventScannerClient } from "@/components/events/event-scanner-client";

/**
 * The scanner page renders NOTHING from the server but the event id, which is
 * already in the URL. Every byte the officer sees — event title, roster, scan
 * history — is read on the client from IndexedDB, so the HTML the service
 * worker caches is free of personnel data. See (scanner)/layout.tsx.
 */
export default async function EventScanPage({
  params,
}: {
  // Next 16: params is async — await before destructuring.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventScannerClient eventId={id} />;
}
