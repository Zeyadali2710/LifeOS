"use client";

import { useRef } from "react";
import type { ApprovalDTO, ApprovalStatus } from "@/lib/agent-types";
import type { ApprovalKind } from "@/lib/approval-kinds";
import { getAgent } from "@/server/agents/registry";
import { formatHM, sydneyParts } from "@/server/time";
import { Badge } from "@/ui/badge";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const stamp = (iso: string) => {
  const p = sydneyParts(new Date(iso));
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${formatHM(new Date(iso))}`;
};

const BADGE: Record<ApprovalKind, string> = { issue: "CREATE ISSUE", event_create: "CREATE EVENT", event_update: "EDIT EVENT", event_delete: "DELETE EVENT", project_create: "CREATE PROJECT", project_update: "EDIT PROJECT", mail_reply: "REPLY", social_publish: "SOCIAL POST" };

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
      className={`h-[26px] flex-1 rounded-full px-3.5 text-[12.5px] ${tab === t ? "bg-white/[.16] text-white" : "text-text-3 hover:text-text-2"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex gap-1 rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
        {tabBtn("pending", `Pending Â· ${pending.length}`)}
        {tabBtn("resolved", "Resolved")}
      </div>
      {items.length === 0 ? (
        tab === "pending" ? (
          <EmptyState icon="verified_user" title="Nothing waiting on you." body="When an agent prepares something that leaves LifeOS, it appears here with exactly what will happen." />
        ) : (
          <EmptyState icon="verified_user" title="No decisions yet." body="Approved, rejected and expired requests are kept here." />
        )
      ) : (
        <div ref={listRef} role="listbox" aria-label={tab === "pending" ? "Pending approvals" : "Resolved approvals"} onKeyDown={onKey} className="glass-card flex flex-col gap-1 rounded-24 p-2">
          {items.map((a, n) => {
            const p = (a.edited ?? a.original) as { title?: unknown; repo?: unknown; name?: unknown; subject?: unknown; platform?: unknown; text?: unknown; providerMode?: unknown; before?: { name?: unknown } };
            const social = a.kind === "social_publish";
            const proj = a.kind === "project_create" || a.kind === "project_update";
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
                style={sel ? { borderColor: `color-mix(in srgb, ${agent?.color ?? "#fff"} 40%, transparent)` } : undefined}
                className={`flex cursor-pointer flex-col gap-2 rounded-16 border px-3 py-2.5 outline-none focus-visible:shadow-[var(--ring-input)] ${
                  sel ? "bg-white/[.06]" : "border-transparent hover:bg-white/[.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-medium tracking-[0.11em] uppercase" style={{ color: agent?.color }}>
                    {agent?.name ?? a.agentId}
                  </span>
                  <span className="flex-1" />
                  {social && <Icon name="public" size={16} className="text-pink" />}
                  {proj && <Icon name="folder_open" size={16} className="text-text-3" />}
                  {a.kind === "mail_reply" && <Icon name="mail" size={16} className="text-text-3" />}
                  <Badge kind="tag" tone={a.kind === "event_delete" ? "red" : "neutral"}>
                    {BADGE[a.kind]}
                  </Badge>
                </div>
                <p className="text-[14px] leading-[1.4] break-words">
                  {social ? `${String(p.platform)} · ${p.providerMode === "mock" ? "MOCK · " : ""}${String(p.text ?? "").slice(0, 100)}` : a.kind === "issue" ? `Create an issue in ${String(p.repo)}: ` : ""}&quot;{String(p.title ?? p.name ?? p.subject ?? p.before?.name ?? "")}&quot;
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-3">
                  <span>Requested {formatHM(new Date(a.createdAt))}</span>
                  <span className={tone}>{label}</span>
                  {a.edited != null && (
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
