import { expiryState, type SocialPlatform } from "@/lib/social-types";
import type { listBoard, platformCards } from "@/server/socials/queries";
import { ButtonLink } from "@/ui/button";
import { Status, Tag } from "@/ui/display";
import { Card } from "@/ui/layout";
import { PLATFORM, formatCount } from "./platform";
import { stamp } from "./model";
import s from "./socials.module.css";

export type PlatformCardData = Awaited<ReturnType<typeof platformCards>>[number];
export function PlatformCard({ card, posts, now }: { card: PlatformCardData; posts: Awaited<ReturnType<typeof listBoard>>; now: Date }) {
  const platform = card.platform as SocialPlatform; const p = PLATFORM[platform]; const connection = card.connection;
  const expiry = expiryState(connection?.expiresAt ?? null, now);
  const reconnect = connection?.status === "error" || expiry === "expired"; const pending = connection?.status === "verification_pending";
  const variants = posts.flatMap((post) => post.variants).filter((v) => v.platform === platform && (["scheduled", "publishing"].includes(v.status) ? v.approvedProviderMode === (card.isMock ? "mock" : "real") : v.isMock === card.isMock));
  const count = variants.filter((v) => ["published", "posted_manually"].includes(v.status) && v.publishedAt && +v.publishedAt >= +now - 30 * 86400000).length;
  const next = variants.filter((v) => v.status === "scheduled" && v.scheduledAt).sort((a, b) => +a.scheduledAt! - +b.scheduledAt!)[0];
  const latestTitle = card.latest ? posts.find((post) => post.id === card.latest!.postId)?.title : null;
  const status = reconnect ? "RECONNECT" : card.isMock ? "MOCK" : pending ? "VERIFICATION PENDING" : expiry === "soon" ? `EXPIRES ${stamp(connection!.expiresAt!)}` : connection?.status === "connected" ? "CONNECTED" : "NOT CONNECTED";
  const hasMetrics = card.capabilities.analytics && (platform !== "tiktok" || card.isMock || connection?.scopes.includes("video.list"));
  return <Card pad as="article"><div className={s.stack}><div className={s.actions}><span className={s.platformMark}>{p.mark}</span><strong>{p.label}</strong>{card.isMock && <Tag>MOCK</Tag>}</div>
    <div><span className={s.number}>{card.followers === null ? <span aria-label="not available">—</span> : formatCount(card.followers)}</span> <span className={s.muted}>followers</span></div>
    <p className={s.muted}>{count} posts · 30D</p><p className={s.muted}>{next?.scheduledAt ? `Next: ${stamp(next.scheduledAt)}` : "Nothing scheduled"}</p>
    {latestTitle && card.latest ? <ButtonLink variant="text" href={`/socials?post=${card.latest.postId}`}>{latestTitle}</ButtonLink> : <p className={s.muted}>No synced or LifeOS posts yet.</p>}
    {hasMetrics && <p className={s.muted}>{Object.entries(card.latest?.metrics ?? {}).filter(([, value]) => typeof value === "number").map(([key, value]) => `${formatCount(value!)} ${key}`).join(" · ")}</p>}
    {platform === "linkedin" && <p className={s.muted}>LinkedIn doesn&apos;t share personal-profile analytics with self-serve apps. Reading previous personal posts requires restricted access.</p>}
    {platform === "portfolio" && <p className={s.muted}>Portfolio analytics aren&apos;t connected. No connection needed.</p>}
    {pending && <p className={s.warning}>Real publishing and analytics are unavailable until the owner verifies the Instagram smoke test in Settings.</p>}
    {platform === "tiktok" && connection && <div className={s.stack}>{[["user.info.basic", "Profile"], ["user.info.stats", "Account stats"], ["video.list", "Video stats"]].map(([scope, label]) => <p className={s.muted} key={scope}>{label}: {connection.scopes.includes(scope!) ? "granted" : "not granted — data unavailable"}</p>)}</div>}
    {connection?.lastSyncError && <p role="alert" className={s.error}>{p.label} sync: {connection.lastSyncError}</p>}
    {platform !== "portfolio" && <><Status tone={reconnect ? "failed" : card.isMock || pending || connection?.status !== "connected" ? "approval" : "working"} glyph={reconnect ? "×" : card.isMock || pending || connection?.status !== "connected" ? "!" : "✓"}>{status}</Status>{(card.isMock || reconnect || pending || !connection) && <ButtonLink variant="text" href={`/settings?section=connections#social-${platform}`}>{reconnect ? "Reconnect" : "Connect"} in Settings</ButtonLink>}</>}
  </div></Card>;
}
