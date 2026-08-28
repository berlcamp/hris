import { permanentRedirect } from "next/navigation";

/**
 * The scanner's old address, kept alive as a redirect.
 *
 * It moved to /scan/[id] when the Attendance Checker became an app of its own
 * rather than a page hanging off the Events module. A phone that pinned the old
 * URL to its home screen, or an officer who bookmarked it, must still land on
 * the scanner rather than a 404.
 */
export default async function LegacyEventScanPage({
  params,
}: {
  // Next 16: params is async — await before destructuring.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/scan/${id}`);
}
