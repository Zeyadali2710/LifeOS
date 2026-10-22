"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { analytics, calendarItems, getPost, listBoard, listSources, platformCards } from "@/server/socials/queries";
import { syncNow } from "@/server/socials-actions";
import type { SocialReview } from "@/server/socials-view";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { PAGE_STATES } from "@/features/shell/page-states";
import { Button, ButtonLink } from "@/ui/button";
import { FilterChip, Segmented, Tabs } from "@/ui/controls";
import { Alert, EmptyState, PageState } from "@/ui/feedback";
import { Page, PageHeader, Section } from "@/ui/layout";
import { ConfirmDialog } from "@/ui/overlay";
import { AnalyticsView } from "./analytics-view";
import { ContentCalendar } from "./content-calendar";
import { Compose } from "./compose";
import { PlatformCard } from "./platform-card";
import { PostReview } from "./post-review";
import { PostPreview, PostStatus } from "./post-preview";
import { dayKey, matchesStatus, stamp } from "./model";
import { PLATFORM } from "./platform";
import s from "./socials.module.css";

export type SocialsData = {
  cards: Awaited<ReturnType<typeof platformCards>>; board: Awaited<ReturnType<typeof listBoard>>;
  post: Awaited<ReturnType<typeof getPost>>; sources: Awaited<ReturnType<typeof listSources>> | null;
  calendar: Awaited<ReturnType<typeof calendarItems>>; analytics: Awaited<ReturnType<typeof analytics>> | null; now: Date;
  reviews?: Record<string, SocialReview>;
};
const FILTERS = [{ value: "all", label: "All" }, { value: "review", label: "Needs you" }, { value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "published", label: "Published" }];

export function SocialsView({ data }: { data: SocialsData }) {
  const router = useRouter(); const sp = useSearchParams(); const { toast } = useShell();
  const [syncing, setSyncing] = useState(false); const [filter, setFilter] = useState("all");
  const [feedFocus, setFeedFocus] = useState(0);
  const [dirty, setDirty] = useState(false); const [pendingNavigation, setPendingNavigation] = useState<Record<string, string | null> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null); const missingPost = useRef<string | null>(null);
  const platform = PLATFORMS.includes(sp.get("platform") as SocialPlatform) ? sp.get("platform")! : "all";
  const creating = sp.get("new") === "1";
  const view = creating || sp.get("post") ? "posts" : sp.get("view") === "calendar" ? "calendar" : sp.get("view") === "analytics" ? "analytics" : sp.get("view") === "posts" ? "posts" : "overview";
  useLiveEvents("approval", () => router.refresh()); useLiveEvents("socials", () => router.refresh());
  const navigate = (change: Record<string, string | null>, discard = false) => {
    if (dirty && !discard) { setPendingNavigation(change); return; }
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(change)) { if (value === null) params.delete(key); else params.set(key, value); }
    router.push(params.size ? `/socials?${params}` : "/socials", { scroll: false });
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const postId = sp.get("post");
  useEffect(() => {
    if (!postId || data.post || missingPost.current === postId) return;
    missingPost.current = postId; toast("That post doesn't exist anymore.", "error");
    const params = new URLSearchParams(sp.toString()); params.delete("post"); router.replace(params.size ? `/socials?${params}` : "/socials", { scroll: false });
  }, [data.post, postId, router, sp, toast]);
  const defaultDate = sp.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date")!) ? sp.get("date")! : dayKey(data.now);
  const variants = data.board.flatMap((post) => post.variants.map((variant) => ({ post, variant }))).filter(({ variant }) => platform === "all" || variant.platform === platform);
  const feed = variants.filter(({ variant }) => matchesStatus(variant.status, filter));
  const barePosts = data.board.filter((post) => !post.variants.length && platform === "all" && ["all", "draft"].includes(filter));
  const open = (id: string, variantPlatform?: string) => navigate({ post: id, variant: variantPlatform ?? null, new: null });
  const newPost = (date = defaultDate) => navigate({ new: "1", post: null, stage: "draft", date });
  const disconnected = !data.cards.some((card) => !card.isMock && card.connection?.status === "connected");
  const sync = async () => { setSyncing(true); const result = await syncNow().catch(() => ({ ok: false })); setSyncing(false); toast(result.ok ? "Sync started" : "Couldn't save that. Try again.", result.ok ? "success" : "error"); };
  const platformControl = <Segmented className={s.platforms} role="tablist" label="Platform" value={platform} options={[{ value: "all", label: "All platforms" }, ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM[p].label }))]} onChange={(value) => navigate({ platform: value === "all" ? null : value })} />;
  const connectionNotice = disconnected && (!data.board.length && !creating ? <PageState kind="disconnected" inline agent="social" title={PAGE_STATES.socials!.disconnected![0]} body={PAGE_STATES.socials!.disconnected![1]} action={{ label: "Connect a platform", href: "/settings?section=connections" }} /> : <Alert tone="info" className={s.connectionNotice}>No platform connected. <ButtonLink variant="text" href="/settings?section=connections">Settings → Connections</ButtonLink></Alert>);
  return <Page label="Socials" className={s.page}>
    <PageHeader title="Socials" sub="Reach, engagement and the posting pipeline across your accounts." actions={<><Button variant="primary" icon="edit_square" onClick={() => newPost()}>New post</Button>{data.cards.some((card) => !card.isMock && card.capabilities.analytics && card.connection?.status === "connected") && <Button icon="refresh" disabled={syncing} onClick={sync}>{syncing ? "Syncing…" : "Sync now"}</Button>}</>} />
    <Tabs className={s.tabs} label="Socials views" value={view === "analytics" ? "overview" : view} items={[{ value: "overview", label: "Overview" }, { value: "posts", label: "Posts", count: data.board.reduce((n, post) => n + post.variants.length, 0) }, { value: "calendar", label: "Calendar" }]} onChange={(value) => navigate({ view: value === "overview" ? null : value, post: null, new: null })} />
    {view !== "overview" && view !== "analytics" && <div className={s.toolbar}>{platformControl}{view === "posts" && <div className={s.filters} role="group" aria-label="Post status">{FILTERS.map((f) => <FilterChip key={f.value} selected={f.value === filter} count={variants.filter(({ variant }) => matchesStatus(variant.status, f.value)).length} onClick={() => setFilter(f.value)}>{f.label}</FilterChip>)}</div>}</div>}
    {view !== "overview" && view !== "analytics" && connectionNotice}
    {!disconnected && !data.board.length && !creating && <PageState kind="empty" inline agent="social" title={PAGE_STATES.socials!.empty![0]} body={PAGE_STATES.socials!.empty![1]} action={{ label: "New post", onClick: () => newPost() }} />}
    {(view === "overview" || view === "analytics") && <div className={s.overview}><AnalyticsView data={data} platform={platform} onOpen={open} platformControl={platformControl} notice={connectionNotice} archive={view === "analytics"} onNeedsReview={() => { setFilter("review"); navigate({ view: "posts", post: null, new: null }); }} onPosts={() => navigate({ view: "posts", post: null, new: null })} /><Section className={s.accountSection} id="social-accounts" label="Accounts"><div className={s.accounts}>{data.cards.filter((card) => platform === "all" || card.platform === platform).map((card) => <PlatformCard key={card.platform} card={card} posts={data.board} now={data.now} />)}</div></Section></div>}
    {view === "calendar" && <ContentCalendar data={data} onOpen={open} onNew={newPost} />}
    {view === "posts" && <div className={s.body}><div className={s.feed} ref={feedRef} role="group" aria-label="Posts feed" onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp", "j", "k", "Home", "End"].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return;
      const buttons = [...(feedRef.current?.querySelectorAll<HTMLButtonElement>("[data-feed-post]") ?? [])]; const index = buttons.indexOf(event.target); if (index < 0) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowDown", "j"].includes(event.key) ? 1 : buttons.length - 1)) % buttons.length; buttons[next]?.focus();
    }}>
      {feed.map(({ post, variant: v }, index) => <article className={s.feedItem} key={v.id}><div className={s.actions}><PostStatus status={v.status} /><span className={s.meta}>{PLATFORM[v.platform as SocialPlatform].label} · {stamp(v.publishedAt ?? v.scheduledAt ?? v.updatedAt)}</span></div><button type="button" data-feed-post tabIndex={Math.min(feedFocus, feed.length + barePosts.length - 1) === index ? 0 : -1} onFocus={() => setFeedFocus(index)} className={s.feedButton} aria-label={`Review ${post.title} on ${PLATFORM[v.platform as SocialPlatform].label}`} aria-pressed={data.post?.id === post.id && (!sp.get("variant") || sp.get("variant") === v.platform)} onClick={() => open(post.id, v.platform)}><PostPreview platform={v.platform as SocialPlatform} title={post.title} text={v.text} imageUrl={v.imageUrl} linkUrl={v.linkUrl} mock={v.isMock || v.approvedProviderMode === "mock"} account={v.platform === "tiktok" ? null : data.cards.find((card) => card.platform === v.platform)?.connection?.login} />{!!Object.keys(v.metrics ?? {}).length && <div className={s.metrics}>{Object.entries(v.metrics ?? {}).map(([key, value]) => <span key={key}>{value} {key}</span>)}</div>}</button></article>)}
      {barePosts.map((post, index) => <button key={post.id} type="button" data-feed-post tabIndex={Math.min(feedFocus, feed.length + barePosts.length - 1) === feed.length + index ? 0 : -1} onFocus={() => setFeedFocus(feed.length + index)} className={s.feedButton} onClick={() => open(post.id)}><strong>{post.title}</strong><p className={s.muted}>{post.stage === "idea" ? "Idea" : "Draft"} · choose a platform to start</p></button>)}
      {!feed.length && !barePosts.length && <div><p className={s.emptyRow}>No posts match this filter.</p><Button variant="text" onClick={() => { setFilter("all"); navigate({ platform: null }); }}>Clear filters</Button></div>}
    </div><aside className={s.review} aria-label="Review">
      {creating ? <Compose onDirtyChange={setDirty} sources={data.sources} cards={data.cards} stage={sp.get("stage") === "idea" ? "idea" : "draft"} agent={sp.get("mode") === "agent"} defaultDate={defaultDate} source={sp.get("source")} sourceId={sp.get("sourceId")} onClose={() => { setDirty(false); navigate({ new: null, stage: null, mode: null, source: null, sourceId: null }, true); }} onCreated={(id, date) => { setDirty(false); navigate({ new: null, stage: null, mode: null, source: null, sourceId: null, post: id, date }, true); }} /> : data.post ? <PostReview reviews={data.reviews} onDirtyChange={setDirty} key={`${data.post.id}:${sp.get("variant") ?? ""}`} post={data.post} cards={data.cards} now={data.now} defaultDate={defaultDate} initialPlatform={sp.get("variant")} onClose={() => { setDirty(false); navigate({ post: null, variant: null }, true); }} /> : <EmptyState title="Select a post to review" body="Edit a draft, review a proposal, or check a published post." action={<Button onClick={() => newPost()}>New post</Button>} />}
      <ButtonLink variant="text" href="/agents?view=approvals">Review Social approvals</ButtonLink>
    </aside></div>}
    <ConfirmDialog open={!!pendingNavigation} title="Discard unsaved changes?" body="Your edits are not saved. Stay here to keep editing, or discard them to continue." confirmLabel="Discard changes" danger onClose={() => setPendingNavigation(null)} onConfirm={() => { if (pendingNavigation) { setDirty(false); navigate(pendingNavigation, true); setPendingNavigation(null); } }} />
  </Page>;
}

