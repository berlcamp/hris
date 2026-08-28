import type { MetadataRoute } from "next";

/**
 * Web app manifest, so the Attendance Checker can install the app to a home
 * screen and run it full-screen at a venue.
 *
 * `start_url` is /scan, the checker's own home screen, rather than the
 * dashboard: this manifest exists for one job, and a checker account cannot
 * reach the dashboard's modules anyway.
 *
 * `scope` is "/" rather than "/scan" on purpose. A launch on an expired session
 * has to pass through /login and /auth/callback before it can reach /scan, and
 * an out-of-scope URL is thrown out to the phone's browser — the officer would
 * sign in, land in Chrome, and never see the installed app again.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/scan",
    name: "LGU HRIS — Event Attendance",
    short_name: "Attendance",
    description:
      "Record event attendance by scanning employee QR ID cards, online or offline.",
    start_url: "/scan",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches --background in .checker-shell (src/app/globals.css), so the
    // splash screen and the status bar do not flash white before the app paints.
    background_color: "#151b26",
    theme_color: "#151b26",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
