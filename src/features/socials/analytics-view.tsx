"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/ui/button";
import { Checkbox, Segmented } from "@/ui/controls";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Card, Section } from "@/ui/layout";
import { dayKey, followerTotal, scheduleInstant, shiftDay } from "./model";
import { formatCount, PLATFORM } from "./platform";
import { FollowersChart } from "./followers-chart";
import { PostsTable } from "./posts-table";
import { PostPreview, PostStatus } from "./post-preview";
import type { SocialsData } from "./socials-view";
import s from "./socials.module.css";

const METRICS = [{ value: "impressions", label: "Impressions" }, { value: "engagements", label: "Engagements" }, { value: "visits", label: "Profile visits" }, { value: "followers", label: "New followers" }];

export function AnalyticsView({ data, onOpen, platform = "all", platformControl, notice, archive = true, onNeedsReview, onPosts }: { data: SocialsData; onOpen(id: string): void; platform?: string; platformControl?: ReactNode; notice?: ReactNode; archive?: boolean; onNeedsReview?(): void; onPosts?(): void }) {
  const router = useRouter(); const sp = useSearchParams();
  const [metric, setMetric] = useState(archive ? "followers" : "impressions");
  const [shown, setShown] = useState(data.cards.map((card) => card.platform));
  const ranges = ["YTD", "7D", "30D", "90D", "1Y"];
  const range = ranges.includes(sp.get("range") ?? "") ? sp.get("range")! : archive ? "YTD" : "7D";
  const days = range === "7D" ? 7 : range === "90D" ? 90 : range === "1Y" ? 365 : 30;
  const sinceDay = range === "YTD" ? `${dayKey(data.now).slice(0, 4)}-01-01` : shiftDay(dayKey(data.now), -(days - 1));
  const since = scheduleInstant(sinceDay, "00:00")!;
  const cards = data.cards.filter((c) => platform === "all" || c.platform === platform).map((c) => ({ ...c, history: c.history.filter((row) => row.date >= dayKey(since)) }));
  const all = data.board.flatMap((post) => post.variants).filter((v) => platform === "all" || v.platform === platform);
  const variants = all.filter((v) => ["published", "posted_manually"].includes(v.status) && v.publishedAt && dayKey(v.publishedAt) >= dayKey(since)).sort((a, b) => +b.publishedAt! - +a.publishedAt!);
  const real = variants.filter((v) => !v.isMock);
  const total = (keys: string[]) => { const values = real.flatMap((v) => Object.entries(v.metrics ?? {}).filter(([key, value]) => keys.includes(key) && typeof value === "number").map(([, value]) => value!)); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
  const followers = followerTotal(cards); const impressions = total(["impressions"]); const engagements = total(["likes", "comments", "shares", "saves"]);
  const needs = all.filter((v) => ["pending_approval", "failed"].includes(v.status)).length;
  const order: Record<string, number> = { failed: 0, pending_approval: 1, publishing: 2, scheduled: 3, draft: 4 };
  const pipeline = all.filter((v) => v.status in order).sort((a, b) => order[a.status]! - order[b.status]!);
  const count = (statuses: string[]) => pipeline.filter((v) => statuses.includes(v.status)).length;
  const summary = [[needs, "need you"], [count(["scheduled", "publishing"]), "scheduled"], [count(["draft"]), "drafts"]].filter(([n]) => n).map(([n, label]) => `${n} ${label}`).join(" · ") || "Nothing queued";
  const rank = (v: typeof variants[number]) => (v.metrics?.likes ?? 0) + (v.metrics?.comments ?? 0) + (v.metrics?.shares ?? 0) + (v.metrics?.saves ?? 0);
  const top = [...real].filter((v) => Object.values(v.metrics ?? {}).some((value) => typeof value === "number")).sort((a, b) => rank(b) - rank(a)).slice(0, 8);
  const kpis: { label: string; value: string; icon: IconName; sub: string }[] = [
    { label: "Followers", value: followers === null ? "—" : formatCount(followers), icon: "groups", sub: followers === null ? "Followers not available" : "Across connected accounts" },
    { label: "Impressions", value: impressions === null ? "—" : formatCount(impressions), icon: "visibility", sub: "Returned post totals this period" },
    { label: "Engagement rate", value: impressions && engagements !== null ? `${(engagements / impressions * 100).toFixed(1)}%` : "—", icon: "thumb_up", sub: engagements === null ? "Engagements not available" : `${formatCount(engagements)} engagements` },
    { label: "Profile visits", value: "—", icon: "person_search", sub: "Not provided by your platforms" },
    { label: "Needs you", value: String(needs), icon: "pending_actions", sub: needs ? "Approve or retry · open" : "Nothing waiting" },
  ];
  const rangeOptions = [{ value: "7D", label: "7 days" }, { value: "30D", label: "30 days" }, ...(archive || !["7D", "30D"].includes(range) ? [{ value: "YTD", label: "YTD" }, { value: "90D", label: "90 days" }, { value: "1Y", label: "1 year" }] : [])];
  const dateFormat = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });
  const metricLabel = archive && metric === "followers" ? "Followers" : METRICS.find((m) => m.value === metric)!.label;
  return <div className={s.overview}>
    <div className={s.toolbar}>{platformControl}<div className={s.rangeControl}><span className={s.rangeLabel}><Icon name="calendar_today" size={18} />{dateFormat.formatRange(since, data.now)}</span><Segmented role="tablist" className={s.range} label="Range" value={range} options={rangeOptions} onChange={(value) => { const params = new URLSearchParams(sp.toString()); params.set("range", value); router.replace(`/socials?${params}`, { scroll: false }); }} /></div></div>
    {notice}
    <div className={s.kpis}>{kpis.map(({ label, value, icon, sub }) => { const content = <><div className={s.actions}><span className={s.kpiIcon} data-attention={label === "Needs you" && needs > 0}><Icon name={icon} size={18} /></span><span>{label}</span></div><span className={s.number}>{value}</span><span className={s.muted}>{sub}</span></>; return label === "Needs you" ? <button key={label} type="button" className={s.kpiButton} onClick={onNeedsReview}>{content}</button> : <Card key={label} className={s.kpi}>{content}</Card>; })}</div>
    <div className={s.overviewRow}>
      <Card as="section" className={s.performance} labelledBy="social-performance"><div className={s.cardHeading}><div className={s.cardTitle}><span className={s.sectionIcon}><Icon name="monitoring" size={19} /></span><div><h2 id="social-performance">Performance</h2><p>{metricLabel} by platform · {metric === "followers" ? "daily snapshots" : "daily history not available"}</p></div></div><Segmented className={s.metricTabs} role="tablist" label="Metric" options={archive ? METRICS.map((m) => m.value === "followers" ? { ...m, label: "Followers" } : m) : METRICS} value={metric} onChange={setMetric} /></div>{metric === "followers" ? <><div className={s.actions} role="group" aria-label="Follower chart platforms">{cards.map((card) => <Checkbox key={card.platform} label={`${card.label}${card.isMock ? " \u00b7 MOCK" : ""}`} checked={shown.includes(card.platform)} onChange={(e) => setShown((old) => e.target.checked ? [...old, card.platform] : old.filter((p) => p !== card.platform))} />)}</div><FollowersChart cards={cards.filter((card) => shown.includes(card.platform))} growth={!archive} /></> : <div className={s.chartEmpty} role="img" aria-label={`${metricLabel} history not available`}><p className={s.muted}>No {metricLabel.toLowerCase()} history available yet.<br />Returned post totals appear in Top performing posts.</p></div>}</Card>
      <Card as="section" className={s.pipeline} labelledBy="social-pipeline"><div className={s.cardHeading}><div className={s.cardTitle}><span className={s.sectionIcon}><Icon name="event_note" size={19} /></span><div><h2 id="social-pipeline">Pipeline</h2><p>{summary}</p></div></div><Button variant="text" onClick={onPosts}>All posts</Button></div><div className={s.pipelineRows}>{pipeline.length ? pipeline.map((v) => <button key={v.id} type="button" className={s.pipelinePost} onClick={() => onOpen(v.postId)}><div className={s.pipelineTitle}><strong>{data.board.find((p) => p.id === v.postId)?.title ?? "Post"}</strong><PostStatus status={v.status} pill /></div><div className={s.actions}><span className={s.platformMark}>{PLATFORM[v.platform as keyof typeof PLATFORM].mark}</span><span>{PLATFORM[v.platform as keyof typeof PLATFORM].label} · {v.scheduledAt ? dateFormat.format(v.scheduledAt) : "Not scheduled"}</span></div></button>) : <p className={s.emptyRow}>Nothing queued for this platform.</p>}</div></Card>
    </div>
    <Card as="section" className={s.topSection} labelledBy="social-top"><div className={s.cardTitle}><span className={s.sectionIcon}><Icon name="trending_up" size={19} /></span><div><h2 id="social-top">Top performing posts</h2><p>Ranked by engagements. Reuse what worked.</p></div></div>{top.length ? <div className={s.topPosts}>{top.map((v) => <button type="button" className={s.topPost} key={v.id} onClick={() => onOpen(v.postId)}><div className={s.topCopy}><div className={s.topMeta}><span>{v.publishedAt ? dateFormat.format(v.publishedAt) : "—"}</span><span>{PLATFORM[v.platform as keyof typeof PLATFORM].label}</span></div><strong>{data.board.find((p) => p.id === v.postId)?.title ?? "Post"}</strong><div className={s.topStats}>{([{ key: "likes", label: "Likes", icon: "thumb_up" }, { key: "comments", label: "Comments", icon: "chat_bubble" }, { key: "shares", label: "Shares", icon: "repeat" }, { key: "ctr", label: "CTR", icon: "ads_click" }] as const).map(({ key, label, icon }) => <div key={key}><span className={s.statIcon} data-metric={key}><Icon name={icon} size={16} /></span><span>{label}</span><strong>{key === "ctr" || v.metrics?.[key] === undefined ? "—" : formatCount(v.metrics[key]!)}</strong></div>)}</div></div><div className={s.topMedia}><PostPreview title={data.board.find((p) => p.id === v.postId)?.title ?? "Post"} text={v.text} platform={v.platform as keyof typeof PLATFORM} imageUrl={v.imageUrl} mediaOnly /></div></button>)}</div> : <p className={s.emptyRow}>No post performance data in this range yet.</p>}</Card>
    {archive && <Section id="social-posts" label="Posts" meta={`${variants.length} ${range === "YTD" ? "this year" : `in the last ${range}`}`}><PostsTable variants={variants} posts={data.board} onOpen={onOpen} /></Section>}
  </div>;
}
