"use client";

import type { ThreadDTO } from "@/lib/agent-types";
import { formatHM, sydneyParts } from "@/server/time";

export function RecentThreads({ threads, currentId, onSelect }: { threads: ThreadDTO[]; currentId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2 p-5">
      <div className="font-mono text-[10px] tracking-[0.08em] text-text-3">RECENT</div>
      {threads.length === 0 ? (
        <p className="text-[13px] text-text-2">No conversations yet.</p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col gap-1 p-0">
          {threads.slice(0, 20).map((t) => {
            const d = new Date(t.updatedAt);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={t.id === currentId || undefined}
                  onClick={() => onSelect(t.id)}
                  className={`flex min-h-11 w-full flex-col gap-0.5 rounded-9 px-3 py-2 text-left hover:bg-fill-2 ${t.id === currentId ? "bg-[rgba(139,140,255,.08)]" : ""}`}
                >
                  <span className="truncate text-[13.5px]">{t.title}</span>
                  <span className="font-mono text-[11px] text-text-3">
                    {sydneyParts(d).weekday} {formatHM(d)} · {t.messageCount} {t.messageCount === 1 ? "message" : "messages"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
