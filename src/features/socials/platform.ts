import type { SocialPlatform } from "@/lib/social-types";

export const PLATFORM = {
  linkedin: { label: "LinkedIn", mark: "in", color: "var(--accent)", host: "linkedin.com", appUrl: "https://www.linkedin.com/" },
  instagram: { label: "Instagram", mark: "ig", color: "var(--status-merged)", host: "instagram.com", appUrl: "https://www.instagram.com/" },
  tiktok: { label: "TikTok", mark: "tt", color: "var(--status-working)", host: "tiktok.com", appUrl: "https://www.tiktok.com/" },
  portfolio: { label: "Portfolio", mark: "pf", color: "var(--ink-2)", host: null, appUrl: null },
} satisfies Record<SocialPlatform, { label: string; mark: string; color: string; host: string | null; appUrl: string | null }>;

export function formatCount(value: number): string {
  return value >= 10_000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : value.toLocaleString("en-AU");
}
