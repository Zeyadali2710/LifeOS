import type { SocialPlatform } from "@/lib/social-types";

export const PLATFORM = {
  linkedin: { label: "LinkedIn", mark: "in", color: "#64d2ff", text: "#64d2ff", tint: "rgba(100,210,255,.12)", host: "linkedin.com", appUrl: "https://www.linkedin.com/" },
  instagram: { label: "Instagram", mark: "ig", color: "#ff6482", text: "#ff6482", tint: "rgba(255,100,130,.12)", host: "instagram.com", appUrl: "https://www.instagram.com/" },
  tiktok: { label: "TikTok", mark: "tt", color: "#40c8e0", text: "#40c8e0", tint: "rgba(64,200,224,.12)", host: "tiktok.com", appUrl: "https://www.tiktok.com/" },
  portfolio: { label: "Portfolio", mark: "pf", color: "#bf5af2", text: "var(--purple-text)", tint: "rgba(191,90,242,.12)", host: null, appUrl: null },
} satisfies Record<SocialPlatform, { label: string; mark: string; color: string; text: string; tint: string; host: string | null; appUrl: string | null }>;

export function formatCount(value: number): string {
  return value >= 10_000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : value.toLocaleString("en-AU");
}
