"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { MAIL_CATEGORIES, type MailCat, type MailCounts, type MailMessageDTO, type MailStatus } from "@/lib/outreach-types";
import { syncMailNowAction } from "@/server/mail-actions";
import { useDialog } from "@/shell/use-dialog";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import { InlineError } from "@/ui/inline-error";
import { Skeleton } from "@/ui/skeleton";
import { EmailCard } from "./email-card";
import { EmailDetail } from "./email-detail";

const DOT: Record<string, string> = {
  IMPORTANT: "bg-red",
  EVENTS: "bg-cyan",
  NETWORKING: "bg-green",
  OPPORTUNITIES: "bg-amber",
  "FOLLOW-UP": "bg-purple-text",
  OTHER: "bg-text-3",
  UNTRIAGED: "bg-text-4",
  ARCHIVED: "bg-text-4",
};

const settingsBtn = (
  <Link href="/settings?section=connections" className="inline-flex h-[30px] items-center rounded-full border border-white/10 bg-white/[.03] px-3 text-[12.5px] font-medium text-text hover:bg-white/[.06]">
    Open Settings
  </Link>
);

const NOT_OK = {
  not_connected: ["Gmail isn't connected", "Connect Google in Settings and allow Gmail to see triaged mail here. LifeOS reads your inbox and only sends replies you approve."],
  scope_missing: ["Gmail access wasn't granted", "Reconnect Google in Settings and allow Gmail. Calendar keeps working either way."],
  reconnect: ["Google needs reconnecting", "Google stopped accepting LifeOS's access. Reconnect in Settings to resume mail sync."],
} as const;

const mql = "(max-width: 759px)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(mql);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useMobile = () => useSyncExternalStore(subscribe, () => window.matchMedia(mql).matches, () => false);

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
}

export type EmailData = {
  status: MailStatus;
  counts: MailCounts;
  inboxCount: number;
  items: MailMessageDTO[];
  cat: MailCat;
  selectedId: string | null;
  approval: ApprovalDTO | null;
  autoDraft: boolean;
};

export function EmailView({ data }: { data: EmailData }) {
  const { status, counts, items, cat, selectedId, approval, autoDraft } = data;
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  const [now] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const mobile = useMobile();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useLiveEvents("approval", () => router.refresh());

  const setParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    q.set("tab", "email");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`/outreach?${q}`, { scroll: false });
  };
  const select = (id: string | null) => setParams({ mail: id });
  const closeSheet = () => setSheet(false);
  const sheetRef = useDialog<HTMLDivElement>(mobile && sheet, closeSheet, { modal: true });

  const selected = items.find((m) => m.id === selectedId) ?? null;
  const idx = selected ? items.indexOf(selected) : -1;
  const nextId = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;

  const sync = async () => {
    setSyncing(true);
    const r = await syncMailNowAction().catch(() => ({ ok: false }) as const);
    setSyncing(false);
    toast(r.ok ? "Sync started" : "Couldn't save that. Try again.", r.ok ? "success" : "error");
  };

  if (status.state in NOT_OK) {
    const [title, bodyText] = NOT_OK[status.state as keyof typeof NOT_OK];
    return <EmptyState icon="mail" title={title} body={bodyText} action={settingsBtn} />;
  }
  if (status.state === "first_sync") {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState icon="sync_problem" title="Syncing your inbox" body="The last 30 days of mail are coming in. This can take a minute." />
        <div aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-24" />
          ))}
        </div>
      </div>
    );
  }

  const onListKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const target = items[idx + d];
    if (!target) return;
    e.preventDefault();
    refs.current.get(target.id)?.focus();
    setParams({ mail: target.id });
  };

  const rows: { key: string; cat: MailCat; label: string; n: number }[] = [
    ...MAIL_CATEGORIES.map((c) => ({ key: c, cat: c.toLowerCase() as MailCat, label: c, n: counts[c] })),
    ...(counts.UNTRIAGED > 0 ? [{ key: "UNTRIAGED", cat: "untriaged" as MailCat, label: "UNTRIAGED", n: counts.UNTRIAGED }] : []),
    ...(counts.ARCHIVED > 0 ? [{ key: "ARCHIVED", cat: "archived" as MailCat, label: "ARCHIVED", n: counts.ARCHIVED }] : []),
  ];

  const detail = selected && (
    <EmailDetail
      key={selected.id}
      mail={selected}
      approval={approval}
      paused={status.triagePaused}
      nextId={nextId}
      autoDraft={autoDraft}
      onAutoDrafted={() => setParams({ draft: null })}
      onSelect={(id) => {
        select(id);
        if (!id) closeSheet();
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {status.triagePaused && (
        <div className="flex items-start gap-3 rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)] p-4">
          <Icon name="pause_circle" size={20} className="mt-0.5 shrink-0 text-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-text">Triage paused: monthly AI cap reached.</p>
            <p className="mt-1 text-[12.5px] text-text-2">
              New mail still syncs and shows its preview. Summaries resume next month, or when you raise the cap.{" "}
              <Link href="/settings?section=ai" className="text-cyan">
                AI and spend
              </Link>
            </p>
          </div>
        </div>
      )}
      {status.lastSyncError && (
        <InlineError
          label="ERROR · GMAIL SYNC"
          icon="sync_problem"
          title={`Gmail didn't sync: ${status.lastSyncError}. Showing the last mail we have.`}
          what="The last sync did not finish."
          why={status.lastSyncError}
          fix="Try syncing again."
          action={{ label: "Sync now", onClick: () => void sync() }}
        />
      )}
      <div className="flex items-center justify-end gap-3">
        <span className="text-[12.5px] text-text-3">{`Synced ${ago(status.lastSyncAt, now)}`}</span>
        <Button variant="secondary" size="sm" loading={syncing} onClick={() => void sync()}>
          <Icon name="refresh" size={16} />
          Sync now
        </Button>
      </div>

      <div className="grid gap-4 desk:grid-cols-[200px_minmax(0,1fr)] desk:gap-6">
        <nav aria-label="Email categories" className="flex snap-x gap-2 overflow-x-auto desk:glass-card desk:snap-none desk:flex-col desk:gap-0.5 desk:overflow-visible desk:rounded-24 desk:p-2">
          {rows.map((r) => {
            const on = r.cat === cat;
            return (
              <button
                key={r.key}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setParams({ cat: r.cat, mail: null })}
                className={`inline-flex h-8 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium max-tab:min-h-11 desk:w-full desk:border-transparent desk:px-3 ${on ? "border-[rgba(100,210,255,.45)] bg-white/[.05] text-text" : "border-white/10 text-text-2 hover:bg-white/[.06]"}`}
              >
                <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ${DOT[r.key]}`} />
                {r.label}
                <span className="ml-auto text-text-3">{r.n}</span>
              </button>
            );
          })}
        </nav>

        <div className="grid min-w-0 gap-6 tab:grid-cols-[minmax(0,340px)_minmax(0,1fr)] desk:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {items.length === 0 ? (
            <p className="text-[13.5px] text-text-2">Nothing in this category.</p>
          ) : (
            <ul role="list" aria-label="Email" onKeyDown={onListKey} className="flex min-w-0 flex-col gap-3">
              {items.map((m) => (
                <EmailCard
                  key={m.id}
                  mail={m}
                  now={now}
                  selected={m.id === selectedId}
                  buttonRef={(el) => {
                    if (el) refs.current.set(m.id, el);
                    else refs.current.delete(m.id);
                  }}
                  onSelect={() => {
                    select(m.id);
                    setSheet(true);
                  }}
                />
              ))}
            </ul>
          )}
          {mobile ? (
            sheet &&
            detail && (
              <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={selected.subject || "Email"} className="glass-menu fixed inset-0 z-50 flex animate-[lo-rise_.25s_ease-out] flex-col overflow-hidden rounded-t-30">
                <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[.06] px-5">
                  <button type="button" onClick={closeSheet} aria-label="Back to inbox" className="grid size-11 place-items-center text-text-2">
                    <Icon name="arrow_back" size={22} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{selected.subject}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-5">{detail}</div>
              </div>
            )
          ) : (
            <div className="min-w-0">{detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}
