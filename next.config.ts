import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Dahua attendance imports send the parsed-row arrays to server actions;
    // a full month of biometric punches can exceed the 1MB default. The raw
    // multi-MB XML itself is parsed in the browser (src/lib/dahua-parse.ts).
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      // The event scanner is the ONE route that needs the camera. The blanket
      // `camera=()` above disables getUserMedia everywhere, including here, so
      // this narrower rule re-enables it for the scanner alone.
      //
      // /scan/:id is the Attendance Checker app's scanner. /events/:id/scan is
      // its old address, which now only redirects here — but a redirect is a
      // navigation, and dropping its rule would mean a phone that still has the
      // old URL pinned loads the scanner with the camera already refused.
      //
      // Order matters and this must stay last: Next resolves duplicate header
      // keys by "the last one wins" (see next/dist/docs .../headers.md,
      // "Header Overriding Behavior"). Moving this above the catch-all silently
      // turns the camera back off and the scanner stops working with a
      // NotAllowedError that looks like a permissions prompt the user declined.
      //
      // Note the camera also requires a SECURE CONTEXT: over plain http:// the
      // browser refuses getUserMedia no matter what this header says.
      {
        source: "/scan/:id",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/events/:id/scan",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
