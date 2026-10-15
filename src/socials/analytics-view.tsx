"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SocialPlatform } from "@/lib/social-types";
import { Checkbox } from "@/ui/field";
import { SectionHeader } from "@/ui/section-header";
import { dayKey } from "./model";
import { FollowersChart } from "./followers-chart";
import { PostsTable } from "./posts-table";
import type { SocialsData } from "./socials-view";

export function AnalyticsView({ data, onOpen }: { data: SocialsData; onOpen(id: string): void }) {
  const router = useRouter(); const sp = useSearchParams(); const ranges = ["7D", "30D", "90D", "1Y"];
  const range = ranges.includes(sp.get("range") ?? "") ? sp.get("range")! : "30D";
  const [shown, setShown] = useState<SocialPlatform[]>(["instagram", "tiktok"]);
  const days = range === "7D" ? 7 : range === "90D" ? 90 : range === "1Y" ? 365 : 30;
  const since = new Date(+data.now - days * 86400000);
  const cards = data.cards.filter((c) => shown.includes(c.platform)).map((c) => ({ ...c, history: c.history.filter((s) => s.date >= dayKey(since)) }));
  const variants = data.board.flatMap((p) => p.variants).filter((v) => ["published", "posted_manually"].includes(v.status) && v.publishedAt && v.publishedAt >= since).sort((a, b) => +b.publishedAt! - +a.publishedAt!);
  return <div className="space-y-6"><fieldset className="flex justify-end gap-4"><legend className="sr-only">Analytics range</legend>{ranges.map((r) => <label key={r} className="flex min-h-11 items-center gap-1.5 text-[12.5px]"><input type="radio" name="analytics-range" checked={r === range} onChange={() => { const p = new URLSearchParams(sp.toString()); p.set("range", r); router.replace(`/socials?${p}`, { scroll: false }); }} />{r}</label>)}</fieldset><div role="group" aria-label="Follower chart platforms" className="flex flex-wrap gap-4">{data.cards.filter((c) => c.platform === "instagram" || c.platform === "tiktok").map((c) => <Checkbox key={c.platform} label={`${c.label}${c.isMock ? " · MOCK" : ""}`} checked={shown.includes(c.platform)} onChange={(e) => setShown((old) => e.target.checked ? [...old, c.platform] : old.filter((p) => p !== c.platform))} />)}</div><FollowersChart cards={cards} />
    <div className="space-y-2 text-[12.5px] text-text-3"><p>LinkedIn doesn&apos;t share personal-profile analytics with self-serve apps.</p><p>Portfolio analytics aren&apos;t connected.</p>{data.cards.some((c) => c.platform === "instagram" && !c.isMock && !c.capabilities.analytics) && <p>Instagram insights are unavailable until the owner verifies the real connection.</p>}{data.cards.some((c) => c.platform === "tiktok" && !c.isMock && !c.connection?.scopes?.includes("user.info.stats")) && <p>TikTok account stats are unavailable: user.info.stats was not granted.</p>}{data.cards.some((c) => c.platform === "tiktok" && !c.isMock && !c.connection?.scopes?.includes("video.list")) && <p>TikTok video stats are unavailable: video.list was not granted.</p>}</div>
    <section aria-labelledby="social-posts"><SectionHeader id="social-posts" label="Posts" meta={`${variants.length} in the last ${range}`} /><PostsTable variants={variants} posts={data.board} onOpen={onOpen} /></section>
  </div>;
}
