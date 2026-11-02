import type { Metadata, Viewport } from "next";
import ConfigGate from "@/components/ConfigGate";
import RegisterSW from "@/components/RegisterSW";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";
import { LanguageProvider } from "@/i18n";

export const metadata: Metadata = {
  title: `${APP_NAME}: ${TAGLINE}`,
  description: "Book a bike to move a parcel across Bengaluru. Pay the driver directly.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh">
        <LanguageProvider>
          <ConfigGate>{children}</ConfigGate>
        </LanguageProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
