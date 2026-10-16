"use client";

import type { Ref } from "react";
import type { MailMessageDTO } from "@/lib/outreach-types";
import { Badge } from "@/ui/badge";
import { Icon } from "@/ui/icon";
import { dateShort, hhmm, sydneyYmd } from "./fmt";

export const IMPORTANCE_TONE = { HIGH: "red", MEDIUM: "amber", LOW: "neutral" } as const;

/** HH:mm today, weekday within the last week, otherwise d MMM (Sydney). */
export function mailTime(iso: string, now: number): string {
  if (sydneyYmd(iso) === sydneyYmd(new Date(now).toISOString())) return hhmm(iso);
  const d = dateShort(iso).split(" "); // "Tue 20 Oct"
  return now - Date.parse(iso) < 6 * 86_400_000 ? d[0]! : `${d[1]} ${d[2]}`;
}

export const senderOf = (m: MailMessageDTO) => m.from.name || m.from.address || "Unknown sender";

export function EmailCard({
  mail: m,
  selected,
  now,
  onSelect,
  buttonRef,
}: {
  mail: MailMessageDTO;
  selected: boolean;
  now: number;
  onSelect: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const triaged = m.triagedAt !== null;
  return (
    <li role="listitem">
      <button
        ref={buttonRef}
        type="button"
        data-mail-id={m.id}
        aria-current={selected ? "true" : undefined}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        className={`glass-card flex w-full flex-col gap-1.5 rounded-24 border p-4 text-left ${selected ? "border-[rgba(100,210,255,.45)] bg-[rgba(100,210,255,.08)]" : "border-white/[.08] hover:bg-white/[.06]"}`}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">{senderOf(m)}</span>
          {(m.flagged || m.flaggedAt) && (
            <span role="img" aria-label="Flagged" className="grid shrink-0 place-items-center text-amber">
              <Icon name="flag" size={15} />
            </span>
          )}
          <span className="shrink-0 text-[12.5px] text-text-3">{mailTime(m.receivedAt, now)}</span>
        </span>
        <span className="truncate text-[13.5px] text-text">{m.subject || "(no subject)"}</span>
        {m.mailbox && <span className="truncate text-[11.5px] text-text-3">{m.mailbox}</span>}
        {triaged && m.summary ? (
          <span className="line-clamp-2 text-[12.5px] text-text-2">{m.summary}</span>
        ) : (
          <span className="flex items-start gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] text-text-3">{m.snippet}</span>
            {!triaged && (
              <Badge kind="tag" tone="neutral">
                NOT TRIAGED
              </Badge>
            )}
          </span>
        )}
        {m.bulk ? (
          <span>
            <Badge kind="tag" tone="neutral">
              BULK
            </Badge>
          </span>
        ) : (
          triaged &&
          m.importance && (
            <span className="flex items-center gap-2 text-[12.5px] text-text-2">
              <Badge kind="status" tone={IMPORTANCE_TONE[m.importance]}>
                {m.importance}
              </Badge>
              {m.action && <span className="min-w-0 truncate">{`→ ${m.action}`}</span>}
            </span>
          )
        )}
      </button>
    </li>
  );
}
