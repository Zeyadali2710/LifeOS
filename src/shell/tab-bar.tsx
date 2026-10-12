"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/icon";
import { MORE_SHEET_KEYS } from "./more-sheet";
import { NAV_ITEMS, SECONDARY_ITEMS, isCurrent } from "./nav";
import { useShell } from "./shell-provider";
import { useSystemState } from "./system-block";
import { useAgentStatus } from "./use-agent-status";

const slot = "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px]";
const all = [...NAV_ITEMS, ...SECONDARY_ITEMS];
const item = (key: string) => all.find((n) => n.key === key)!;
const cap = (n: number) => (n > 99 ? "99+" : String(n));

function LinkSlot({ k, badge = 0 }: { k: string; badge?: number }) {
  const pathname = usePathname();
  const n = item(k);
  const current = isCurrent(pathname, n.href);
  return (
    <Link
      href={n.href}
      aria-current={current ? "page" : undefined}
      aria-label={badge > 0 ? `${n.label}, ${badge} waiting` : undefined}
      className={`${slot} ${current ? "bg-white/[.16] text-white" : "text-soft"}`}
    >
      <Icon name={n.icon} size={22} fill={current} />
      {n.label}
      {badge > 0 && (
        <span className="absolute top-[5px] left-[calc(50%+6px)] rounded-full bg-amber px-1 text-[10px] font-bold text-on-accent">{cap(badge)}</span>
      )}
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { openAI, moreOpen, setMoreOpen } = useShell();
  const { status } = useAgentStatus();
  const { attention } = useSystemState();
  const inMore = MORE_SHEET_KEYS.some((k) => isCurrent(pathname, item(k).href));
  return (
    <nav
      aria-label="Primary"
      className="glass-chrome fixed right-3 bottom-[calc(14px+env(safe-area-inset-bottom))] left-3 z-30 grid grid-cols-5 items-center rounded-full p-1.5 tab:hidden"
    >
      <LinkSlot k="home" />
      <LinkSlot k="approvals" badge={status?.approvalsWaiting ?? 0} />
      <button
        type="button"
        onClick={() => openAI()}
        aria-label="Open LifeOS assistant"
        className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),var(--shadow-ask)]"
      >
        <Icon name="auto_awesome" size={25} />
      </button>
      <LinkSlot k="agents" />
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        className={`${slot} ${inMore ? "bg-white/[.16] text-white" : "text-soft"}`}
      >
        <Icon name="more_horiz" size={22} fill={inMore} />
        More
        {attention && <span aria-hidden="true" className={`absolute top-[7px] left-[calc(50%+8px)] size-1.5 rounded-full ${attention === "red" ? "bg-red" : "bg-amber"}`} />}
      </button>
    </nav>
  );
}
