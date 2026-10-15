"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { analytics, calendarItems, getPost, listBoard, listSources, platformCards } from "@/server/socials/queries";
import { syncNow } from "@/server/socials-actions";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { PageHeader } from "@/ui/page-header";
import { PlatformCard } from "./platform-card";
import { ContentBoard } from "./content-board";
import { PostSheet } from "./post-sheet";
import { NewPostDialog } from "./new-post-dialog";
import { ContentCalendar } from "./content-calendar";
import { AnalyticsView } from "./analytics-view";
import { dayKey } from "./model";

export type SocialsData = {
  cards: Awaited<ReturnType<typeof platformCards>>;
  board: Awaited<ReturnType<typeof listBoard>>;
  post: Awaited<ReturnType<typeof getPost>>;
  sources: Awaited<ReturnType<typeof listSources>> | null;
  calendar: Awaited<ReturnType<typeof calendarItems>>;
  analytics: Awaited<ReturnType<typeof analytics>> | null;
  now: Date;
};
const VIEWS = ["overview", "calendar", "analytics"] as const;

export function SocialsView({ data }: { data: SocialsData | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [syncing, setSyncing] = useState(false);
  const missingPost = useRef<string | null>(null);
  const view = sp.get("view") === "calendar" ? "calendar" : sp.get("view") === "analytics" ? "analytics" : "overview";
  useLiveEvents("approval", () => router.refresh());
  useLiveEvents("socials", () => router.refresh());
  const navigate = (change: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(change)) { if (value === null) params.delete(key); else params.set(key, value); }
    router.push(params.size ? `/socials?${params}` : "/socials", { scroll: false });
  };
  const postId = sp.get("post");
  useEffect(() => {
    if (!data || !postId || data.post || missingPost.current === postId) return;
    missingPost.current = postId; toast("That post doesn't exist anymore.", "error");
    const params = new URLSearchParams(sp.toString()); params.delete("post");
    router.replace(params.size ? `/socials?${params}` : "/socials", { scroll: false });
  }, [data, postId, router, sp, toast]);
  const defaultDate = sp.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date")!) ? sp.get("date")! : data ? dayKey(data.now) : "";
  const setView = (value: typeof VIEWS[number]) => {
    const params = new URLSearchParams(sp.toString());
    if (value === "overview") params.delete("view"); else params.set("view", value);
    router.replace(params.size ? `/socials?${params}` : "/socials", { scroll: false });
  };
  const sync = async () => {
    setSyncing(true);
    const result = await syncNow().catch(() => ({ ok: false }));
    setSyncing(false);
    toast(result.ok ? "Sync started" : "Couldn't save that. Try again.", result.ok ? "success" : "error");
  };

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-6 [&_header]:mb-0">
        <PageHeader eyebrow={{ text: "SOCIALS", className: "text-pink" }} title="Socials" lead="Write a post once, plan it on the calendar, and see how it does." />
        <div className="flex flex-wrap items-center gap-2 max-tab:w-full">
          <div role="tablist" aria-label="Socials views" className="inline-flex rounded-full border border-white/[.06] bg-white/[.04] p-[3px] max-tab:flex-1">
            {VIEWS.map((value, index) => <button key={value} ref={(el) => { tabs.current[index] = el; }} type="button" role="tab" id={`socials-tab-${value}`} aria-controls={`socials-panel-${value}`} aria-selected={view === value} tabIndex={view === value ? 0 : -1}
              onClick={() => setView(value)} onKeyDown={(event) => {
                const next = event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : event.key === "ArrowRight" ? (index + 1) % VIEWS.length : event.key === "ArrowLeft" ? (index + VIEWS.length - 1) % VIEWS.length : null;
                if (next === null) return;
                event.preventDefault(); tabs.current[next]?.focus(); setView(VIEWS[next]!);
              }} className={`h-[26px] rounded-full px-3.5 text-[12.5px] capitalize max-tab:flex-1 max-tab:min-h-11 ${view === value ? "bg-white/[.12] text-text" : "text-text-2 hover:text-text"}`}>{value}</button>)}
          </div>
          {data?.cards.some((card) => !card.isMock && card.capabilities.analytics && card.connection?.status === "connected") && <Button variant="secondary" size="sm" loading={syncing} onClick={sync}><Icon name="refresh" size={16} />Sync now</Button>}
        </div>
      </div>
      {!data ? <div role="alert" className="glass-card flex flex-col items-start gap-3 rounded-24 p-5 text-[13.5px] text-text-2">Couldn&apos;t load Socials.<Button variant="secondary" size="sm" onClick={() => router.refresh()}>Try again</Button></div> : <div role="tabpanel" id={`socials-panel-${view}`} aria-labelledby={`socials-tab-${view}`}>
        {view === "overview" && <><div className="grid grid-cols-1 gap-3 tab:grid-cols-2 min-[1100px]:grid-cols-4">{data.cards.map((card) => <PlatformCard key={card.platform} card={card} posts={data.board} now={data.now} />)}</div><ContentBoard posts={data.board} onOpen={(id) => navigate({ post: id })} onNew={(agent) => navigate({ new: "1", stage: "idea", mode: agent ? "agent" : null, post: null })} /></>}
        {view === "calendar" && <ContentCalendar data={data} onOpen={(id) => navigate({ post: id })} onNew={(day) => navigate({ new: "1", stage: "draft", date: day, mode: null, post: null })} />}
        {view === "analytics" && <AnalyticsView data={data} onOpen={(id) => navigate({ post: id })} />}
        {data.post && <PostSheet key={data.post.id} post={data.post} cards={data.cards} now={data.now} defaultDate={defaultDate} onClose={() => navigate({ post: null })} />}
        {sp.get("new") === "1" && <NewPostDialog sources={data.sources} cards={data.cards} stage={sp.get("stage") === "idea" ? "idea" : "draft"} agent={sp.get("mode") === "agent"} defaultDate={defaultDate} source={sp.get("source")} sourceId={sp.get("sourceId")} onClose={() => navigate({ new: null, stage: null, mode: null, source: null, sourceId: null })} onCreated={(id, date) => navigate({ new: null, stage: null, mode: null, source: null, sourceId: null, post: id, date })} />}
      </div>}
    </div>
  );
}
