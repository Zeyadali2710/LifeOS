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
  auth: { icon: "lock", color: "text-text-2" },
  system: { icon: "dns", color: "text-text-2" },
  github: { icon: "code", color: "text-text" },
  email: { icon: "mail", color: "text-cyan" },
  calendar: { icon: "event", color: "text-green" },
  social: { icon: "public", color: "text-pink" },
  agent: { icon: "memory", color: "text-purple-text" },
  project: { icon: "deployed_code", color: "text-amber" },
};
const FALLBACK = { icon: "dns" as IconName, color: "text-text-2" };
const TONES = { red: "text-red", amber: "text-amber", green: "text-green" } as const;
const SHOWN = 8;

export function Item({ a, fresh }: { a: ActivityDTO; fresh: boolean }) {
  const s = SOURCES[a.source.toLowerCase()] ?? FALLBACK;
  const color = a.tone ? TONES[a.tone] : s.color;
  return (
    <li
      className={`grid grid-cols-[44px_26px_minmax(0,1fr)] gap-2.5 rounded-16 px-3 py-2.5 transition-colors duration-1000 ${
        fresh ? "animate-[lo-in_450ms_ease] bg-white/5" : "bg-transparent"
      }`}
    >
      <time dateTime={a.at} className="pt-[5px] text-[11px] font-medium text-text-3">
        {formatHM(new Date(a.at))}
      </time>
      <span className={`flex size-[26px] items-center justify-center rounded-7 bg-white/5 ${color}`}>
        <Icon name={s.icon} size={15} />
      </span>
      <div className="min-w-0">
        <div className={`text-[10.5px] font-medium tracking-[.1em] uppercase ${color}`}>
          {a.source}
        </div>
        <div className="text-[13px] leading-[1.4] text-text">{a.title}</div>
        {a.detail && <div className="truncate text-[11px] text-text-3">{a.detail}</div>}
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
        <h2 id="live-activity" className="text-[11px] leading-[1.3] font-medium tracking-[.14em] text-text-3 uppercase">
          Live activity
        </h2>
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${connected ? "animate-[lo-pulse-g_2s_ease-out_infinite] bg-green" : "bg-amber"}`}
        />
        {!connected && <span className="text-[10.5px] text-amber">RECONNECTING</span>}
        <span aria-hidden="true" className="h-px flex-1 bg-white/[.06]" />
        <button
          type="button"
          aria-pressed={frozen !== null}
          onClick={() => setFrozen(frozen ? null : activity)}
          className="min-h-11 text-[10.5px] font-medium text-text-2 hover:text-text tab:min-h-0"
        >
          {frozen ? (pending > 0 ? `RESUME · ${pending} NEW` : "RESUME") : "PAUSE"}
        </button>
      </div>
      {!loaded ? (
        <div className="flex flex-col gap-2 glass-card rounded-24 p-2">
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
          className="max-h-[520px] overflow-hidden glass-card rounded-24 p-2"
        >
          {shown.map((a) => (
            <Item key={a.id} a={a} fresh={freshIds.has(a.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
