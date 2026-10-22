import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./legacy.css";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], weight: ["400", "500"], variable: "--font-newsreader", display: "swap" });
const ui = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-instrument", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });
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

export const viewport: Viewport = { themeColor: "#f5f2eb", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, which the per-request CSP nonce (src/proxy.ts) requires.
  await headers();
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable} ${symbols.variable}`}>
      <body>{children}</body>
    </html>
  );
}
