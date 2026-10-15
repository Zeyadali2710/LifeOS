import { SocialsView, type SocialsData } from "@/socials/socials-view";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";
import { analytics, calendarItems, getPost, listBoard, listSources, platformCards } from "@/server/socials/queries";
import { calendarRange, dayKey } from "@/socials/model";

export const metadata = { title: "Socials · LifeOS" };
export const dynamic = "force-dynamic";

export default async function SocialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const sp = await searchParams;
  const now = new Date();
  let data: SocialsData | null = null;
  try {
    const h = db();
    const anchor = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && Number.isFinite(Date.parse(sp.d)) ? sp.d : dayKey(now);
    const { from, to } = calendarRange(anchor, sp.cal === "week" ? "week" : "month");
    const wantPost = typeof sp.post === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.post) ? sp.post : null;
    const [cards, board, post, sources, calendar, stats] = await Promise.all([
      platformCards(h), listBoard(h), wantPost ? getPost(h, wantPost) : null,
      sp.new === "1" || sp.source ? listSources(h) : null,
      sp.view === "calendar" ? calendarItems(h, from, to) : [],
      sp.view === "analytics" ? analytics(h) : null,
    ]);
    const days = sp.range === "7D" ? 7 : sp.range === "90D" ? 90 : sp.range === "1Y" ? 365 : 30;
    const since = new Date(now.getTime() - days * 86400000);
    const rangeVariants = stats?.variants.filter((v) => v.publishedAt && v.publishedAt >= since) ?? [];
    const totals: Record<string, number> = {};
    for (const variant of rangeVariants) for (const [metric, value] of Object.entries(variant.metrics ?? {})) if (typeof value === "number") totals[metric] = (totals[metric] ?? 0) + value;
    data = { cards, board, post, sources, calendar, analytics: stats ? { ...stats,
      snapshots: stats.snapshots.filter((s) => s.date >= since.toISOString().slice(0, 10)),
      totals, variants: rangeVariants } : null, now };
  } catch (error) {
    console.error("socials: load failed", error instanceof Error ? error.name : "unknown");
  }
  return <SocialsView data={data} />;
}
