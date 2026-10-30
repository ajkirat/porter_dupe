import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Header, { APP_NAME } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} · Bike parcel delivery in Bengaluru`,
  description: "Book a bike to move a parcel across Bengaluru. Pay the driver directly.",
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* The header reads the current path, which is only known at request time. */}
        <Suspense fallback={<div className="h-[53px] border-b border-stone-200 bg-white" />}>
          <Header />
        </Suspense>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
