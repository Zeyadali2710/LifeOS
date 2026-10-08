"use client";

import { useRef } from "react";
import type { ApprovalDTO, ApprovalStatus } from "@/lib/agent-types";
import { getAgent } from "@/server/agents/registry";
import { formatHM, sydneyParts } from "@/server/time";
import { Badge } from "@/ui/badge";
import { EmptyState } from "@/ui/empty-state";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const stamp = (iso: string) => {
  const p = sydneyParts(new Date(iso));
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${formatHM(new Date(iso))}`;
};

const STATE: Record<ApprovalStatus, [string, string]> = {
  pending: ["PENDING", "text-amber"],
  approved: ["APPROVED", "text-green"],
  executing: ["APPROVED", "text-green"],
  executed: ["EXECUTED", "text-green"],
  failed: ["FAILED", "text-red"],
  rejected: ["REJECTED", "text-red"],
  expired: ["EXPIRED", "text-text-3"],
  cancelled: ["CANCELLED", "text-text-3"],
};
export const stateLabel = (s: ApprovalStatus) => STATE[s][0];

export function ApprovalList({
  pending,
  resolved,
  tab,
  onTab,
  selectedId,
  onSelect,
}: {
  pending: ApprovalDTO[];
  resolved: ApprovalDTO[];
  tab: "pending" | "resolved";
  onTab: (t: "pending" | "resolved") => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const items = tab === "pending" ? pending : resolved;
  const listRef = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const opts = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const i = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (e.key === "Enter" && i >= 0) {
      e.preventDefault();
      opts[i]?.click();
      // detail mounts on the next render; focus its first control then
      setTimeout(() => document.querySelector<HTMLElement>('[aria-label="Approval detail"] button, [aria-label="Approval detail"] input')?.focus(), 0);
    }
  };
  const tabBtn = (t: "pending" | "resolved", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => onTab(t)}
      className={`h-8 flex-1 rounded-7 px-3 text-[13px] ${tab === t ? "bg-[#1f222b] text-text" : "text-text-3 hover:text-text-2"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex gap-1 rounded-9 bg-inset p-1">
        {tabBtn("pending", `Pending · ${pending.length}`)}
        {tabBtn("resolved", "Resolved")}
      </div>
      {items.length === 0 ? (
        tab === "pending" ? (
          <EmptyState icon="verified_user" title="Nothing waiting on you." body="When an agent prepares something that leaves LifeOS, it appears here with exactly what will happen." />
        ) : (
          <EmptyState icon="verified_user" title="No decisions yet." body="Approved, rejected and expired requests are kept here." />
        )
      ) : (
        <div ref={listRef} role="listbox" aria-label={tab === "pending" ? "Pending approvals" : "Resolved approvals"} onKeyDown={onKey} className="flex flex-col gap-2">
          {items.map((a, n) => {
            const p = a.edited ?? a.original;
            const agent = getAgent(a.agentId);
            const sel = a.id === selectedId;
            const [label, tone] = STATE[a.status];
            return (
              <div
                key={a.id}
                role="option"
                aria-selected={sel}
                tabIndex={sel || (!selectedId && n === 0) ? 0 : -1}
                onClick={() => onSelect(a.id)}
                className={`flex cursor-pointer flex-col gap-2 rounded-12 border p-3.5 outline-none focus-visible:shadow-[var(--ring-input)] ${
                  sel ? "border-[rgba(139,140,255,.4)] bg-[rgba(139,140,255,.06)]" : "border-[rgba(255,255,255,.08)] hover:border-[rgba(255,255,255,.18)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] font-medium tracking-[0.07em] uppercase" style={{ color: agent?.color }}>
                    {agent?.name ?? a.agentId}
                  </span>
                  <span className="flex-1" />
                  <Badge kind="tag" tone="neutral">
                    CREATE ISSUE
                  </Badge>
                </div>
                <p className="text-[14px] leading-[1.4] break-words">
                  Create an issue in {p.repo}: &quot;{p.title}&quot;
                </p>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-3">
                  <span>Requested {formatHM(new Date(a.createdAt))}</span>
                  <span className={tone}>{label}</span>
                  {a.edited && (
                    <Badge kind="tag" tone="amber">
                      EDITED
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
