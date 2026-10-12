import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Familjen_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif", display: "swap" });
const grotesk = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
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

export const viewport: Viewport = { themeColor: "#121214", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, which the per-request CSP nonce (src/proxy.ts) requires.
  await headers();
  return (
    <html lang="en" className={`${serif.variable} ${grotesk.variable} ${symbols.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
