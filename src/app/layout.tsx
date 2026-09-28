import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import { AppNav } from "@/components/app-nav";
import { BrandMark } from "@/components/brand-mark";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Brand guide: Red Hat Display — Black (headings), Bold (subheadings), Regular (body).
const redHat = Red_Hat_Display({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: "Marketing Loop · ScrumCraft",
  description: "ScrumCraft marketing metrics and the daily PDCA improvement loop",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${redHat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <BrandMark />
            <AppNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
