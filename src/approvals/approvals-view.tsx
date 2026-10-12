"use client";

import { useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { useLiveEvents } from "@/shell/live-provider";
import { Icon } from "@/ui/icon";
import { InlineError } from "@/ui/inline-error";
import { ApprovalDetail, type WriteFacts } from "./approval-detail";
import { ApprovalList, stateLabel } from "./approval-list";

const upsert = (list: ApprovalDTO[], a: ApprovalDTO) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]);

export function ApprovalsView({
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
  const [pending, setPending] = useState(initialPending);
  const [resolved, setResolved] = useState(initialResolved);
  const [extra, setExtra] = useState(initialSelected);
  const [selId, setSelId] = useState<string | null>(initialSelected?.id ?? null);
  const [tab, setTab] = useState<"pending" | "resolved">(initialSelected && initialSelected.status !== "pending" ? "resolved" : "pending");
  const [mobileDetail, setMobileDetail] = useState(Boolean(initialSelected));
  const [say, setSay] = useState("");

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
    if (!dto) return; // resync: the server page re-keys this view on the next navigation
    apply(dto);
    if (dto.id === selId) setSay(`Approval ${stateLabel(dto.status).toLowerCase()}`);
  });

  const detail = [...pending, ...resolved].find((a) => a.id === selId) ?? (extra && extra.id === selId ? extra : null);
  const select = (id: string) => {
    setSelId(id);
    setMobileDetail(true);
    window.history.replaceState(null, "", `/approvals?id=${id}`);
  };
  const idx = detail ? pending.findIndex((a) => a.id === detail.id) : -1;
  const step = (d: number) => {
    const n = pending[idx + d];
    if (n) select(n.id);
  };
  const headline = pending.length === 0 ? "You are all caught up." : pending.length === 1 ? "One decision is waiting on you." : `${pending.length} decisions are waiting on you.`;
  const nav = "grid size-11 place-items-center text-text-2 disabled:opacity-30";

  return (
    <div className="mx-auto max-w-[1480px]">
      <header className="mb-8">
        <div className="mb-3 text-[11px] font-medium tracking-[.12em] text-amber">APPROVAL CENTRE</div>
        <h1 className="font-display text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">{headline}</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-normal text-text-2">
          Agents can read and prepare. Anything that creates, sends, changes or deletes waits here until you decide.
        </p>
      </header>
      {missingId && (
        <div className="mb-6">
          <InlineError
            label="ERROR · APPROVAL"
            title="That approval isn't available."
            what="It may have been removed or the link is out of date."
            why="No approval with that id exists."
            fix="Choose one from the list."
          />
        </div>
      )}
      <div className="flex flex-wrap gap-6">
        <div className={`min-w-0 flex-[1_1_340px] max-w-[440px] max-[719px]:max-w-none ${mobileDetail ? "max-[719px]:hidden" : ""}`}>
          <ApprovalList pending={pending} resolved={resolved} tab={tab} onTab={setTab} selectedId={selId} onSelect={select} />
        </div>
        <div className={`min-w-0 flex-[2_1_520px] ${mobileDetail ? "" : "max-[719px]:hidden"}`}>
          <div className="mb-3 hidden items-center gap-2 max-[719px]:flex">
            <button type="button" aria-label="Back to approvals" onClick={() => setMobileDetail(false)} className={nav}>
              <Icon name="arrow_back" size={22} />
            </button>
            <span className="flex-1 text-[11px] tracking-[.12em] text-amber">APPROVAL{idx >= 0 ? ` · ${idx + 1} OF ${pending.length}` : ""}</span>
            <button type="button" aria-label="Previous approval" disabled={idx <= 0} onClick={() => step(-1)} className={`${nav} rotate-180`}>
              <Icon name="chevron_right" size={22} />
            </button>
            <button type="button" aria-label="Next approval" disabled={idx < 0 || idx >= pending.length - 1} onClick={() => step(1)} className={nav}>
              <Icon name="chevron_right" size={22} />
            </button>
          </div>
          {detail ? (
            <ApprovalDetail key={detail.id} approval={detail} write={write} onChange={apply} />
          ) : (
            !missingId && <p className="text-[13px] text-text-3">Choose an approval from the list to review it.</p>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {say}
      </div>
    </div>
  );
}
