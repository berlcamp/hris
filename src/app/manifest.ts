import type { MetadataRoute } from "next";

/**
 * Web app manifest, so the Event Attendance Officer can install the scanner to
 * a home screen and run it full-screen at a venue.
 *
 * `start_url` is the events list rather than the dashboard: this manifest
 * exists for one job, and the officer's account cannot reach the dashboard's
 * modules anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LGU HRIS — Event Attendance",
    short_name: "HRIS Events",
    description:
      "Record event attendance by scanning employee QR ID cards, online or offline.",
    start_url: "/events",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f172a",
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
