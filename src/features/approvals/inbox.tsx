"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { approveAction, rejectAction } from "@/server/approval-actions";
import { getAgent } from "@/server/agents/registry";
import { useAgentStatus } from "@/features/shell/agent-status";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { approvalsHref } from "@/features/shell/nav";
import { Alert } from "@/ui/feedback";
import { PixelAvatar } from "@/ui/pixel-avatar";
import { ApprovalDetail, rowTitle, type WriteFacts } from "./detail";
import { fullReviewOnly, RESOLVED, since, stamp } from "./summary";
import s from "./approvals.module.css";

const upsert = (list: ApprovalDTO[], a: ApprovalDTO) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]);
const TONE = { working: "var(--status-working)", failed: "var(--status-failed)", idle: "var(--ink-3)", approval: "var(--status-approval)" } as const;
// Kinds whose list-level "A" is safe without opening the detail (no checkbox or locked review step).
const QUICK = new Set(["issue", "mail_reply", "event_create", "event_update", "project_create", "project_update"]);

export function ApprovalsInbox({
  initialPending,
  initialResolved,
  initialSelected,
  missingId,
  write,
}: {
  initialPending: ApprovalDTO[];
  initialResolved: ApprovalDTO[];
  initialSelected: ApprovalDTO | null;
  missingId: boolean;
  write: WriteFacts;
}) {
  const { toast } = useShell();
  const { refresh } = useAgentStatus();
  const [pending, setPending] = useState(initialPending);
  const [resolved, setResolved] = useState(initialResolved);
  const [extra, setExtra] = useState(initialSelected);
  const [tab, setTab] = useState<"pending" | "resolved">(initialSelected && initialSelected.status !== "pending" ? "resolved" : "pending");
  const [selId, setSelId] = useState<string | null>(initialSelected?.id ?? null);
  const [snapshot, setSnapshot] = useState({ pending: initialPending, resolved: initialResolved, selectedId: initialSelected?.id });
  if (snapshot.pending !== initialPending || snapshot.resolved !== initialResolved || snapshot.selectedId !== initialSelected?.id) {
    setSnapshot({ pending: initialPending, resolved: initialResolved, selectedId: initialSelected?.id });
    setPending(initialPending);
    setResolved(initialResolved);
    setExtra(initialSelected);
    if (snapshot.selectedId !== initialSelected?.id && initialSelected) {
      setSelId(initialSelected.id);
      setTab(initialSelected.status === "pending" ? "pending" : "resolved");
    }
  }
  const [say, setSay] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const apply = (a: ApprovalDTO) => {
    if (a.status === "pending") {
      setPending((l) => upsert(l, a));
      setResolved((l) => l.filter((x) => x.id !== a.id));
    } else {
      setPending((l) => l.filter((x) => x.id !== a.id));
      setResolved((l) => upsert(l, a).slice(0, 50));
    }
    setExtra((e) => (e && e.id === a.id ? a : e));
  };
  useLiveEvents("approval", (dto) => {
    if (!dto) return; // resync: the server page re-renders on the next navigation
    apply(dto);
    if (dto.id === selId) setSay(`Approval ${RESOLVED[dto.status].label.toLowerCase()}`);
  });

  const list = tab === "pending" ? pending : resolved;
  const current = [...pending, ...resolved].find((a) => a.id === selId) ?? (extra && extra.id === selId ? extra : null) ?? list[0] ?? null;
  if (current && !selId) setSelId(current.id);
  const idx = current ? list.findIndex((a) => a.id === current.id) : -1;

  const select = (id: string) => {
    setSelId(id);
    window.history.replaceState(null, "", approvalsHref(id));
  };
  useEffect(() => {
    if (!current) return;
    document.getElementById(`appr-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const quick = async (a: ApprovalDTO, approve: boolean) => {
    if (approve && (fullReviewOnly(a.kind) || !QUICK.has(a.kind))) {
      toast("Review this one in the detail before approving.", "error");
      return;
    }
    const r = await (approve ? approveAction(a.id) : rejectAction(a.id)).catch(() => ({ ok: false as const, approval: undefined }));
    if (r.approval) apply(r.approval);
    if (!r.ok) return toast("Couldn't record that decision. Try again.", "error");
    toast(approve ? "Approved. It runs now and is recorded in Activity." : "Rejected. Nothing was sent.");
    void refresh();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = list[Math.max(0, Math.min(list.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))];
      if (n) {
        select(n.id);
        document.getElementById(`appr-${n.id}`)?.focus();
      }
    } else if (tab === "pending" && current && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      void quick(current, true);
    } else if (tab === "pending" && current && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      void quick(current, false);
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      document.querySelector<HTMLElement>("[data-approval-detail] [data-edit], [data-approval-detail] textarea, [data-approval-detail] input")?.focus();
    }
  };

  return (
    <div className={s.wrap}>
      <div className={s.top}>
        <p className={s.intro}>Agents propose; nothing writes to the outside world until you approve the exact content shown. Approvals expire after 7 days and cancel the run.</p>
        <div role="tablist" aria-label="Approvals" className={s.tabs}>
          {(
            [
              ["pending", "Pending", pending.length],
              ["resolved", "Resolved", resolved.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={s.tab}
              onClick={() => {
                setTab(k);
                setSelId(null);
              }}
            >
              {label}
              <span className={s.tabN}>{n}</span>
            </button>
          ))}
        </div>
      </div>
      {missingId && (
        <div style={{ marginTop: 16 }}>
          <Alert>That approval isn&apos;t available. It may have been removed, or the link is out of date.</Alert>
        </div>
      )}
      <div className={s.body}>
        <div className={s.list}>
          {list.length > 0 && <div ref={listRef} role="listbox" aria-label="Approvals. Arrow keys move, A approves, R rejects, E edits." onKeyDown={onKey}>
          {list.map((a) => {
            const r = RESOLVED[a.status];
            const who = getAgent(a.agentId)?.name ?? a.agentId;
            const meta = a.status === "pending" ? `${who} · ${a.tool} · ${since(a.createdAt)}` : `${r.glyph} ${r.label} · ${stamp(a.decidedAt ?? a.createdAt)}`;
            const on = a.id === current?.id;
            return (
              <button key={a.id} id={`appr-${a.id}`} type="button" role="option" aria-selected={on} tabIndex={on ? 0 : -1} className={s.opt} onClick={() => select(a.id)}>
                <PixelAvatar agent={a.agentId} state={a.status === "pending" ? "approval" : "idle"} size={28} />
                <span className={s.optText}>
                  <span className={s.optTitle}>{rowTitle(a)}</span>
                  <span className={s.optMeta} style={{ color: TONE[r.tone] }}>
                    {meta}
                  </span>
                </span>
              </button>
            );
          })}
          </div>}
          {list.length === 0 && (
            <div className={s.listEmpty}>
              <PixelAvatar agent="orchestrator" state="idle" size={42} radius={6} />
              {tab === "pending" ? "Nothing is waiting on you." : "Nothing resolved yet."}
            </div>
          )}
          <div className={s.keys} aria-hidden="true">
            ↑↓ MOVE · A APPROVE · R REJECT · E EDIT
          </div>
        </div>
        <section aria-label="Approval detail" className={s.detail} data-approval-detail>
          {current && <ApprovalDetail key={current.id} approval={current} write={write} onChange={apply} />}
        </section>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {say}
      </div>
    </div>
  );
}
