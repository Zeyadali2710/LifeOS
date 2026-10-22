"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FollowUpDTO, OutreachEventDTO } from "@/lib/outreach-types";
import type { SourceStatus } from "@/server/outreach/queries";
import { syncEventsNowAction } from "@/server/outreach-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { Icon } from "@/legacy-ui/icon";
import type { CalendarOption } from "./add-to-calendar-dialog";
import { EmailView, type EmailData } from "./email-view";
import { EventList, SourceStrip } from "./event-list";
import { FollowUps } from "./follow-ups";
import { ImportUrlDialog } from "./import-url-dialog";
import { PipelineBoard } from "./pipeline-board";

const chip = (on: boolean) =>
  `inline-flex h-8 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[13px] max-tab:min-h-11 ${
    on ? "border-[rgba(100,210,255,.45)] bg-[rgba(100,210,255,.12)] text-text" : "border-white/10 bg-white/[.03] text-text-2 hover:bg-white/[.06]"
  }`;

export type MailData = EmailData;
const TABS = [
  { key: "events", label: "EVENTS" },
  { key: "email", label: "EMAIL" },
  { key: "follow-ups", label: "FOLLOW-UPS" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function OutreachView({
  events,
  pipeline,
  status,
  interests,
  calendars,
  defaultCalendarId,
  hideMock,
  mail,
  followUps,
  followUpCount,
}: {
  events: OutreachEventDTO[];
  pipeline: OutreachEventDTO[];
  status: SourceStatus;
  interests: string[];
  calendars: CalendarOption[];
  defaultCalendarId: string | null;
  hideMock: boolean;
  mail: MailData | null;
  followUps: FollowUpDTO[] | null;
  followUpCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  // the event detail's "All events" link returns here with the same tab and filters (WR-U05)
  useEffect(() => sessionStorage.setItem("outreach:list", `/outreach${sp.size ? `?${sp}` : ""}`), [sp]);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLiveEvents("outreach", () => router.refresh());

  // palette command: ?import=1 opens the dialog once, then the param is dropped
  const importParam = sp.get("import");
  useEffect(() => {
    if (importParam !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL command, param is dropped right after
    setImporting(true);
    const q = new URLSearchParams(window.location.search);
    q.delete("import");
    router.replace(q.size ? `/outreach?${q}` : "/outreach", { scroll: false });
    // only when the param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importParam]);
  const tab: Tab = sp.get("tab") === "email" ? "email" : sp.get("tab") === "follow-ups" ? "follow-ups" : "events";
  const view = sp.get("view") === "pipeline" ? "pipeline" : "list";

  const selected = useMemo(() => (sp.get("interest") ?? "").split(",").filter((i) => interests.includes(i)), [sp, interests]);
  const setParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    router.replace(qs ? `/outreach?${qs}` : "/outreach", { scroll: false });
  };
  const toggleInterest = (i: string) => {
    const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i];
    setParams({ interest: next.length ? next.join(",") : null });
  };

  const shown = useMemo(() => {
    if (selected.length === 0) return events;
    const want = selected.map((s) => s.toLowerCase());
    return events.filter((e) => e.signals.some((s) => s.label === "INTERESTS" && s.terms.some((t) => want.includes(t.toLowerCase()))));
  }, [events, selected]);

  const sync = async () => {
    setSyncing(true);
    const r = await syncEventsNowAction().catch(() => ({ ok: false }) as const);
    setSyncing(false);
    toast(r.ok ? "Sync started" : "Couldn't save that. Try again.", r.ok ? "success" : "error");
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + TABS.length) % TABS.length;
    tabRefs.current[n]?.focus();
    goTab(TABS[n]!.key);
  };
  const goTab = (k: Tab) => setParams({ tab: k === "events" ? null : k, cat: null, mail: null, draft: null });
  const counts: Record<Tab, number> = { events: events.length, email: mail?.inboxCount ?? 0, "follow-ups": followUpCount };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Outreach" className="flex gap-6 overflow-x-auto border-b border-white/[.06]">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`outreach-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`outreach-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onKeyDown={(e) => onTabKey(e, i)}
            onClick={() => goTab(t.key)}
            className={`relative inline-flex h-10 shrink-0 items-center gap-2 text-[12.5px] font-medium tracking-[.1em] uppercase ${tab === t.key ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-cyan" : "text-text-3 hover:text-text-2"}`}
          >
            {t.label}
            <Badge kind="count" tone="neutral">
              {counts[t.key]}
            </Badge>
          </button>
        ))}
      </div>

      {tab === "email" && (
        <div role="tabpanel" id="outreach-panel-email" aria-labelledby="outreach-tab-email">
          {mail ? (
            <EmailView data={mail} />
          ) : (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-24 border border-[rgba(255,105,97,.3)] bg-[rgba(255,105,97,.06)] p-5 text-[13.5px] text-text-2">
              Couldn&apos;t load email.
              <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
      {tab === "follow-ups" && (
        <div role="tabpanel" id="outreach-panel-follow-ups" aria-labelledby="outreach-tab-follow-ups">
          <FollowUps items={followUps} onDraft={(id) => setParams({ tab: "email", mail: id, cat: null, draft: "1" })} />
        </div>
      )}
      {tab === "events" && (
      <div role="tabpanel" id="outreach-panel-events" aria-labelledby="outreach-tab-events" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by interest" className="flex flex-wrap items-center gap-2">
            {interests.map((i) => (
              <button key={i} type="button" aria-pressed={selected.includes(i)} className={chip(selected.includes(i))} onClick={() => toggleInterest(i)}>
                {i}
              </button>
            ))}
            <Link href="/settings?section=outreach" className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] text-text-2 hover:bg-white/[.06] hover:text-text">
              Edit interests
            </Link>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status.mockCount > 0 && (
              <button type="button" aria-pressed={hideMock} className={chip(hideMock)} onClick={() => setParams({ mock: hideMock ? "1" : "0" })}>
                <Icon name="visibility_off" size={16} />
                Hide mock
              </button>
            )}
            <div className="inline-flex rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
              {(["list", "pipeline"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setParams({ view: v === "list" ? null : v })}
                  className={`h-[26px] rounded-full px-3.5 text-[12.5px] max-tab:min-h-11 ${view === v ? "bg-white/[.12] text-text" : "text-text-2"}`}
                >
                  {v === "list" ? "List" : "Pipeline"}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" loading={syncing} onClick={sync}>
              <Icon name="refresh" size={16} />
              Sync now
            </Button>
            <Button variant="primary" size="sm" onClick={() => setImporting(true)}>
              <Icon name="add" size={16} />
              Import event
            </Button>
          </div>
        </div>
        <p className="text-[12.5px] text-text-3">
          {view === "pipeline" ? `${pipeline.length} saved events by stage` : `${shown.length} events · Sydney · next 60 days · sorted by relevance`}
        </p>
        <span aria-live="polite" className="sr-only">
          {view === "pipeline" ? `${pipeline.length} saved events shown` : `${shown.length} events shown`}
        </span>
        {view === "pipeline" ? (
          <>
            <SourceStrip status={status} onImport={() => setImporting(true)} />
            <PipelineBoard events={pipeline} onShowList={() => setParams({ view: null })} />
          </>
        ) : (
          <EventList
            events={shown}
            total={events.length}
            status={status}
            calendars={calendars}
            defaultCalendarId={defaultCalendarId}
            onClear={() => setParams({ interest: null })}
            onImport={() => setImporting(true)}
          />
        )}
        <ImportUrlDialog open={importing} onClose={() => setImporting(false)} />
      </div>
      )}
    </div>
  );
}
