import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Self-hosted (src/app/fonts, Latin subset from Fontsource) rather than
// next/font/google: the Google variant downloads the fonts at build time, and a
// failed download fails the whole Vercel build.
const dmSans = localFont({
  variable: "--font-sans",
  src: "./fonts/dm-sans-latin-wght.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
});

const jetbrainsMono = localFont({
  variable: "--font-geist-mono",
  src: [
    { path: "./fonts/jetbrains-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LGU HRIS",
  description:
    "Human Resource Information System for Local Government Units — CSC, COA, and DILG Compliant",
  // iOS Safari ignores the web app manifest's display mode. These are what
  // actually make the Attendance Checker app (/scan) open full screen from an
  // iPhone home screen instead of inside browser chrome. See src/app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Attendance",
    statusBarStyle: "black-translucent",
  },
  // Android Chrome's install banner uses the manifest; this is the tab icon and
  // the iOS home-screen icon.
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
