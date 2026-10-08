"use client";

import { useState } from "react";
import { formatHM } from "@/server/time";
import type { ActivityDTO } from "@/lib/live-types";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Skeleton } from "@/ui/skeleton";
import { useLive } from "./live-provider";

const SOURCES: Record<string, { icon: IconName; color: string }> = {
  auth: { icon: "lock", color: "#a3a6b4" },
  system: { icon: "dns", color: "#a3a6b4" },
  github: { icon: "code", color: "#c9cbd6" },
  email: { icon: "mail", color: "#6cb6ff" },
  calendar: { icon: "event", color: "#4fd1a1" },
  social: { icon: "public", color: "#e889c4" },
  agent: { icon: "memory", color: "#a5a6ff" },
  project: { icon: "deployed_code", color: "#e8b86a" },
};
const FALLBACK = { icon: "dns" as IconName, color: "#a3a6b4" };
const TONES = { red: "#ff6b6b", amber: "#e8b86a", green: "#4fd1a1" } as const;
const SHOWN = 8;

export function Item({ a, fresh }: { a: ActivityDTO; fresh: boolean }) {
  const s = SOURCES[a.source.toLowerCase()] ?? FALLBACK;
  const color = a.tone ? TONES[a.tone] : s.color;
  return (
    <li
      className={`grid grid-cols-[44px_26px_minmax(0,1fr)] gap-2.5 rounded-9 p-2.5 transition-colors duration-1000 ${
        fresh ? "animate-[lo-in_450ms_ease] bg-[rgba(139,140,255,.05)]" : "bg-transparent"
      }`}
    >
      <time dateTime={a.at} className="pt-[5px] font-mono text-[11px] font-medium text-text-3">
        {formatHM(new Date(a.at))}
      </time>
      <span className="flex size-[26px] items-center justify-center rounded-7 bg-[rgba(255,255,255,.04)]" style={{ color }}>
        <Icon name={s.icon} size={15} />
      </span>
      <div className="min-w-0">
        <div className="font-mono text-[10.5px] font-medium tracking-[0.05em] uppercase" style={{ color }}>
          {a.source}
        </div>
        <div className="text-[13px] leading-[1.4] text-text">{a.title}</div>
        {a.detail && <div className="truncate font-mono text-[11px] text-text-3">{a.detail}</div>}
      </div>
    </li>
  );
}

export function ActivityList() {
  const { activity, connected, loaded, freshIds } = useLive();
  const [frozen, setFrozen] = useState<ActivityDTO[] | null>(null);
  const shown = (frozen ?? activity).slice(0, SHOWN);
  const have = new Set(frozen?.map((a) => a.id));
  const pending = frozen ? activity.filter((a) => !have.has(a.id)).length : 0;

  return (
    <section aria-labelledby="live-activity">
      <div className="mb-3.5 flex items-center gap-3">
        <h2 id="live-activity" className="font-mono text-[11px] leading-[1.3] font-medium tracking-[0.1em] text-text-3 uppercase">
          Live activity
        </h2>
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${connected ? "animate-[lo-pulse-g_2s_infinite] bg-green" : "bg-amber"}`}
        />
        {!connected && <span className="font-mono text-[10.5px] text-amber">RECONNECTING</span>}
        <span aria-hidden="true" className="h-px flex-1 bg-[rgba(255,255,255,.06)]" />
        <button
          type="button"
          aria-pressed={frozen !== null}
          onClick={() => setFrozen(frozen ? null : activity)}
          className="min-h-11 font-mono text-[10.5px] font-medium text-text-2 hover:text-text tab:min-h-0"
        >
          {frozen ? (pending > 0 ? `RESUME · ${pending} NEW` : "RESUME") : "PAUSE"}
        </button>
      </div>
      {!loaded ? (
        <div className="flex flex-col gap-2 rounded-14 border border-[rgba(255,255,255,.07)] bg-surface p-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        connected ? (
          <EmptyState icon="lock" title="No activity yet." body="Sign-ins, system changes and agent work appear here as they happen." />
        ) : (
          <EmptyState icon="dns" title="Live updates are offline." body="LifeOS keeps trying to reconnect. Recent activity appears once it does." />
        )
      ) : (
        <ul
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="max-h-[520px] overflow-hidden rounded-14 border border-[rgba(255,255,255,.07)] bg-surface p-1.5"
        >
          {shown.map((a) => (
            <Item key={a.id} a={a} fresh={freshIds.has(a.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
