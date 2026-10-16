import Link from "next/link";
import type { SocialPlatform } from "@/lib/social-types";
import { expiryState } from "@/lib/social-types";
import type { listBoard, platformCards } from "@/server/socials/queries";
import { Badge } from "@/ui/badge";
import { StatusDot } from "@/ui/status-dot";
import { formatCount, PLATFORM } from "./platform";

export type PlatformCardData = Awaited<ReturnType<typeof platformCards>>[number];
type BoardPost = Awaited<ReturnType<typeof listBoard>>[number];
const date = (value: Date, time = false) => new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney", day: "numeric", month: "short", ...(time ? { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
}).format(value);
const unavailable = <><span aria-hidden="true">—</span><span className="sr-only">not available</span></>;

export function PlatformCard({ card, posts, now }: { card: PlatformCardData; posts: BoardPost[]; now: Date }) {
  const platform = card.platform as SocialPlatform;
  const p = PLATFORM[platform];
  const connection = card.connection;
  const expiry = expiryState(connection?.expiresAt ?? null, now);
  const reconnect = connection?.status === "error" || expiry === "expired";
  const pending = connection?.status === "verification_pending";
  const variants = posts.flatMap((post) => post.variants).filter((v) => v.platform === platform &&
    (["scheduled", "publishing"].includes(v.status) ? v.approvedProviderMode === (card.isMock ? "mock" : "real") : v.isMock === card.isMock));
  const count = variants.filter((v) => ["published", "posted_manually"].includes(v.status) && v.publishedAt && v.publishedAt.getTime() >= now.getTime() - 30 * 86400000).length;
  const next = variants.filter((v) => v.status === "scheduled" && v.scheduledAt).sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
  const latestTitle = card.latest ? posts.find((post) => post.id === card.latest!.postId)?.title : null;
  const history = card.history.filter((s) => s.followers !== null);
  const first = history[0];
  const last = history.at(-1);
  const min = Math.min(...history.map((s) => s.followers!));
  const spread = Math.max(...history.map((s) => s.followers!)) - min || 1;
  const status = reconnect ? "RECONNECT" : card.isMock ? "MOCK" : pending ? "VERIFICATION PENDING" : expiry === "soon" ? `EXPIRES ${date(connection!.expiresAt!)}` : "CONNECTED";
  const hasPostMetrics = card.capabilities.analytics && (platform !== "tiktok" || card.isMock || connection?.scopes.includes("video.list"));
  const metricText = Object.entries(hasPostMetrics ? card.latest?.metrics ?? {} : {}).filter(([, value]) => typeof value === "number").map(([key, value]) => `${formatCount(value!)} ${key}`).join(" · ");

  return (
    <article className="glass-card lo-in flex flex-col gap-3.5 overflow-hidden rounded-24 p-5" aria-label={`${p.label} account`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-14 text-[13.5px] font-medium" style={{ color: p.text, background: p.tint }}>{p.mark}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] leading-[1.1]">{p.label}</h2>
        </div>
        {card.isMock && <Badge kind="tag" tone="neutral">MOCK</Badge>}
      </div>
      <div className="flex items-baseline gap-2"><span className="font-display text-[29px] leading-none">{card.followers === null ? unavailable : formatCount(card.followers)}</span><span className="text-[12.5px] text-text-3">followers</span></div>
      {first && last && history.length >= 2 ? (
        <svg viewBox="0 0 240 40" className="h-10 w-full" role="img" aria-label={`${p.label} followers since ${first.date}: ${first.followers} to ${last.followers}`}>
          <polyline points={history.map((s, i) => `${i / (history.length - 1) * 240},${36 - (s.followers! - min) / spread * 32}`).join(" ")} fill="none" stroke={p.color} strokeWidth="1.5" />
        </svg>
      ) : <p className="flex h-10 items-center text-[12.5px] text-text-3">{first ? `History since ${date(new Date(`${first.date}T12:00:00+11:00`))}` : "No history yet"}</p>}
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-[11px] tracking-[.14em] text-text-3 uppercase">Posts · 30D</dt><dd className="mt-1 text-[13.5px] font-medium">{formatCount(count)}</dd></div>
        <div><dt className="text-[11px] tracking-[.14em] text-text-3 uppercase">Next</dt><dd className="mt-1 text-[12.5px] text-text-2">{next?.scheduledAt ? date(next.scheduledAt, true) : "Nothing scheduled"}</dd></div>
      </dl>
      <div className="flex flex-col gap-1 border-t border-white/[.05] pt-3">
        <p className="text-[11px] tracking-[.14em] text-text-3 uppercase">Latest post</p>
        {card.latest && latestTitle ? <Link href={`/socials?post=${card.latest.postId}`} aria-label={`Open latest ${p.label} post: ${latestTitle}`} className="line-clamp-2 text-[13.5px] font-medium text-text hover:text-cyan">{latestTitle}</Link> : <p className="text-[12.5px] text-text-3">Nothing posted from LifeOS yet.</p>}
        {card.latest?.publishedAt && <p className="text-[12.5px] text-text-3">{date(card.latest.publishedAt)}{metricText && ` · ${metricText}`}{card.latest.isMock && " · MOCK"}</p>}
      </div>
      {platform === "linkedin" && <p className="text-[12.5px] text-text-3">LinkedIn doesn&apos;t share personal-profile analytics with self-serve apps.</p>}
      {platform === "portfolio" && <p className="text-[12.5px] text-text-3">Portfolio analytics aren&apos;t connected.</p>}
      {pending && <p className="text-[12.5px] text-amber">Real publishing and analytics are unavailable until the owner verifies the Instagram smoke test in Settings.</p>}
      {platform === "tiktok" && connection && <div className="flex flex-col gap-1 text-[12.5px] text-text-3">{[["user.info.basic", "Profile"], ["user.info.stats", "Account stats"], ["video.list", "Video stats"]].map(([scope, label]) => <p key={scope}>{label}: {connection.scopes.includes(scope!) ? "granted" : "not granted — data unavailable"}</p>)}</div>}
      {connection?.lastSyncError && <p role="alert" className="text-[12.5px] text-red">{p.label} didn&apos;t sync: {connection.lastSyncError}</p>}
      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {platform === "portfolio" ? <span className="text-[12.5px] text-text-3">No connection needed</span> : <><StatusDot state={reconnect ? "attention" : card.isMock ? "idle" : pending || expiry === "soon" ? "paused" : "online"} /><span className="text-[10.5px] font-medium tracking-[.14em] text-text-2">{status}</span></>}
        {(card.isMock || reconnect || pending) && <Link href={`/settings?section=connections#social-${platform}`} aria-label={`Connect ${p.label} in Settings`} className="ml-auto text-[12.5px]">Connect in Settings</Link>}
      </footer>
    </article>
  );
}
