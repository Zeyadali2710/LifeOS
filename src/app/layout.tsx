import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const symbols = localFont({
  src: "./fonts/material-symbols-outlined.woff2",
  variable: "--font-symbols",
  display: "block",
  weight: "300",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "LifeOS",
  description: "Personal operating system",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0c10", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, which the per-request CSP nonce (src/proxy.ts) requires.
  await headers();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${symbols.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
