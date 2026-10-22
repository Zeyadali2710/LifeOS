"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Checkbox } from "@/ui/controls";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Card, Section } from "@/ui/layout";
import { dayKey, followerTotal } from "./model";
import { formatCount, PLATFORM } from "./platform";
import { FollowersChart } from "./followers-chart";
import { PostsTable } from "./posts-table";
import { PostPreview, PostStatus } from "./post-preview";
import type { SocialsData } from "./socials-view";
import s from "./socials.module.css";

export function AnalyticsView({ data, onOpen, platform = "all" }: { data: SocialsData; onOpen(id: string): void; platform?: string }) {
  const router = useRouter(); const sp = useSearchParams(); const ranges = ["YTD", "7D", "30D", "90D", "1Y"];
  const [shown, setShown] = useState(data.cards.map((card) => card.platform));
  const range = ranges.includes(sp.get("range") ?? "") ? sp.get("range")! : "YTD";
  const days = range === "7D" ? 7 : range === "90D" ? 90 : range === "1Y" ? 365 : 30;
  const since = range === "YTD" ? new Date(`${dayKey(data.now).slice(0, 4)}-01-01T00:00:00+11:00`) : new Date(+data.now - days * 86400000);
  const cards = data.cards.filter((c) => platform === "all" || c.platform === platform).map((c) => ({ ...c, history: c.history.filter((row) => row.date >= dayKey(since)) }));
  const all = data.board.flatMap((post) => post.variants).filter((v) => platform === "all" || v.platform === platform);
  const variants = all.filter((v) => ["published", "posted_manually"].includes(v.status) && v.publishedAt && v.publishedAt >= since).sort((a, b) => +b.publishedAt! - +a.publishedAt!);
  const real = variants.filter((v) => !v.isMock);
  const total = (keys: string[]) => { const values = real.flatMap((v) => Object.entries(v.metrics ?? {}).filter(([key, value]) => keys.includes(key) && typeof value === "number").map(([, value]) => value!)); return values.length ? formatCount(values.reduce((a, b) => a + b, 0)) : "—"; };
  const followers = followerTotal(cards); const pipeline = all.filter((v) => !["published", "posted_manually"].includes(v.status));
  const rank = (v: typeof variants[number]) => (v.metrics?.likes ?? 0) + (v.metrics?.comments ?? 0) + (v.metrics?.shares ?? 0) + (v.metrics?.saves ?? 0);
  const top = [...real].filter((v) => Object.values(v.metrics ?? {}).some((value) => typeof value === "number")).sort((a, b) => rank(b) - rank(a)).slice(0, 8);
  const kpis: { label: string; value: string; icon: IconName }[] = [
    { label: "Followers", value: followers === null ? "—" : formatCount(followers), icon: "groups" },
    { label: "Impressions", value: total(["impressions"]), icon: "visibility" },
    { label: "Engagements", value: total(["likes", "comments", "shares", "saves"]), icon: "monitoring" },
    { label: "Views", value: total(["views"]), icon: "trending_up" },
    { label: "Needs you", value: String(all.filter((v) => ["pending_approval", "failed"].includes(v.status)).length), icon: "pending_actions" },
  ];
  return <div className={s.stack}>
    <fieldset className={s.actions}><legend className="sr-only">Analytics range</legend>{ranges.map((r) => <label key={r} className={s.range}><input type="radio" name="analytics-range" checked={r === range} onChange={() => { const params = new URLSearchParams(sp.toString()); params.set("range", r); router.replace(`/socials?${params}`, { scroll: false }); }} />{r}</label>)}</fieldset>
    <div className={s.kpis}>{kpis.map(({ label, value, icon }) => <Card pad key={label}><div className={s.kpi}><div className={s.actions}><span className={s.kpiIcon}><Icon name={icon} size={18} /></span><span>{label}</span></div><span className={s.number}>{value}</span><span className={s.muted}>{label === "Needs you" ? "Approve or retry in Posts" : "Returned data · mock excluded"}</span></div></Card>)}</div>
    <div className={s.overviewRow}><div className={s.performance}><Card pad><div className={s.stack}><strong>Performance · followers by platform</strong><div className={s.actions} role="group" aria-label="Follower chart platforms">{cards.map((card) => <Checkbox key={card.platform} label={`${card.label}${card.isMock ? " · MOCK" : ""}`} checked={shown.includes(card.platform)} onChange={(e) => setShown((old) => e.target.checked ? [...old, card.platform] : old.filter((p) => p !== card.platform))} />)}</div><FollowersChart cards={cards.filter((card) => shown.includes(card.platform))} /></div></Card></div><div className={s.pipeline}><Card pad><div className={s.stack}><strong>Pipeline</strong>{pipeline.length ? pipeline.map((v) => <button key={v.id} type="button" className={s.calendarPost} onClick={() => onOpen(v.postId)}><strong>{data.board.find((p) => p.id === v.postId)?.title ?? "Post"}</strong><div className={s.actions}><span>{PLATFORM[v.platform as keyof typeof PLATFORM].label}</span><PostStatus status={v.status} /></div></button>) : <p className={s.muted}>Nothing queued for this platform.</p>}</div></Card></div></div>
    <Section id="social-top" label="Top performing posts" meta="Ranked by engagements"><div className={s.topPosts}>{top.map((v) => <button type="button" className={s.topPost} key={v.id} onClick={() => onOpen(v.postId)}><PostPreview title={data.board.find((p) => p.id === v.postId)?.title ?? "Post"} text={v.text} platform={v.platform as keyof typeof PLATFORM} imageUrl={v.imageUrl} /><div className={s.metrics}>{Object.entries(v.metrics ?? {}).map(([key, value]) => <span key={key}>{value} {key}</span>)}</div></button>)}{!top.length && <p className={s.muted}>No post performance data in this range yet.</p>}</div></Section>
    <Section id="social-posts" label="Posts" meta={`${variants.length} ${range === "YTD" ? "this year" : `in the last ${range}`}`}><PostsTable variants={variants} posts={data.board} onOpen={onOpen} /></Section>
  </div>;
}
