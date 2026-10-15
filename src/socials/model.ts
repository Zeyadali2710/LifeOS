import type { SocialMetrics, SocialPlatform } from "@/lib/social-types";
import { sydneyInstant, sydneyParts } from "@/server/time";
import { PLATFORM } from "./platform";
import type { SocialsData } from "./socials-view";

export type Post = NonNullable<SocialsData["post"]>;
export type Variant = Post["variants"][number];
export type Card = SocialsData["cards"][number];
export const editableVariant = (status: string) => status === "draft";
export function canPublish(card: { platform: string; isMock: boolean; capabilities: { publish: boolean }; connection: { status: string } | null }) {
  return !["tiktok", "portfolio"].includes(card.platform) && card.capabilities.publish && (card.isMock || card.connection?.status === "connected");
}
export function safePostUrl(platform: SocialPlatform, value: string): string | null {
  try {
    const u = new URL(value); const host = PLATFORM[platform].host;
    if (u.protocol !== "https:" || u.username || u.password || (host && u.hostname !== host && !u.hostname.endsWith(`.${host}`))) return null;
    if (platform === "tiktok" && !/\/video\/\d+/.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}
export function dayKey(at: Date): string {
  const p = sydneyParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export const shiftDay = (day: string, amount: number) => {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10);
};
export function calendarDays(anchor: string, mode: "week" | "month") {
  const d = new Date(`${anchor}T12:00:00Z`);
  if (mode === "month") d.setUTCDate(1);
  const pad = (d.getUTCDay() + 6) % 7;
  const count = mode === "week" ? 7 : Math.ceil((pad + new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()) / 7) * 7;
  d.setUTCDate(d.getUTCDate() - pad);
  return Array.from({ length: count }, (_, i) => shiftDay(d.toISOString().slice(0, 10), i));
}
export function scheduleInstant(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const at = sydneyInstant(y, m, d, h, min); const p = sydneyParts(at);
  return p.year === y && p.month === m && p.day === d && p.hour === h && p.minute === min ? at : null;
}
export function followerTotal(cards: { isMock: boolean; followers: number | null }[]) {
  const values = cards.filter((c) => !c.isMock && c.followers !== null);
  return values.length ? values.reduce((sum, c) => sum + c.followers!, 0) : null;
}
export const metricValue = (metrics: SocialMetrics | null, key: keyof SocialMetrics) => typeof metrics?.[key] === "number" ? metrics[key] : null;
export const stamp = (at: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
