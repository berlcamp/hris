import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
