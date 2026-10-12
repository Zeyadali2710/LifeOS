"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/icon";
import { MoreMenu } from "./more-menu";
import { isCurrent, PRIMARY_ITEMS } from "./nav";
import { useShell } from "./shell-provider";
import { useSystemState } from "./system-block";
import { useAgentStatus } from "./use-agent-status";
import { useLive } from "./live-provider";

function cap(n: number) {
  return n > 99 ? "99+" : String(n);
}

const pill = "glass-chrome rounded-full h-[54px] tab:h-[50px] flex items-center pointer-events-auto";
const ctl = "relative h-11 w-11 shrink-0 place-items-center rounded-full tab:h-10 tab:w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

export function Header({ owner, version }: { owner: { name: string; email: string }; version: string }) {
  const pathname = usePathname();
  const { openPalette, openNotifications, openAI, aiOpen, isApple } = useShell();
  const { unread } = useLive();
  const waiting = useAgentStatus().status?.approvalsWaiting ?? 0;
  const { healthRow } = useSystemState();

  const initial = (owner.name.trim() || owner.email).charAt(0).toUpperCase();
  const bellLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const mod = isApple ? "⌘" : "Ctrl ";

  return (
    <header className="pointer-events-none fixed inset-x-4 top-[14px] z-30 flex items-center gap-3">
      <span className="sr-only" role="status">
        {healthRow.text}
      </span>

      <div className={`${pill} gap-2 px-[14px]`}>
        <Link href="/" aria-label="LifeOS home" className="flex items-center gap-2 text-text no-underline hover:text-text hover:no-underline">
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded-full"
            style={{ background: "radial-gradient(circle at 30% 30%, #fff, #64d2ff 40%, #0a84ff 70%, #5e5ce6)" }}
          />
          <span className="hidden font-display text-[24px] leading-none italic mid:inline">LifeOS</span>
        </Link>
      </div>

      <div className="pointer-events-none hidden min-w-0 flex-1 justify-center tab:flex">
        <div className={`${pill} gap-[2px] p-[5px]`}>
          <nav aria-label="Primary" className="flex items-center gap-[2px]">
            {PRIMARY_ITEMS.map((n) => {
              const cur = isCurrent(pathname, n.href);
              const badge = n.key === "approvals" ? waiting : 0;
              const label = badge > 0 ? `${n.label}, ${badge} waiting` : n.label;
              const tipId = `tip-${n.key}`;
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  aria-current={cur ? "page" : undefined}
                  aria-label={label}
                  aria-describedby={tipId}
                  className={`group relative flex h-10 items-center gap-1.5 rounded-full px-[10px] text-[13.5px] no-underline transition-[background-color,color] duration-150 hover:no-underline wide:px-[13px] ${
                    cur ? "bg-white/[.16] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)] hover:text-white" : "text-soft hover:text-white"
                  }`}
                >
                  <Icon name={n.icon} size={20} fill={cur} className="wide:hidden" />
                  <span className="hidden wide:inline">{n.label}</span>
                  {badge > 0 && (
                    <span aria-hidden="true" className="rounded-full bg-amber px-1.5 py-px text-[11px] font-bold text-on-accent">
                      {cap(badge)}
                    </span>
                  )}
                  <span
                    id={tipId}
                    role="tooltip"
                    className="glass-menu pointer-events-none absolute top-[calc(100%+10px)] left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2.5 rounded-10 px-2.5 py-[7px] text-[12.5px] whitespace-nowrap text-text group-hover:flex group-focus-visible:flex wide:hidden!"
                  >
                    {n.label}
                    {n.shortcut && <span className="text-[11px] text-soft">{n.shortcut}</span>}
                  </span>
                </Link>
              );
            })}
          </nav>
          <MoreMenu version={version} />
        </div>
      </div>

      <div className="flex-1 tab:hidden" />

      <div className={`${pill} gap-1 p-[5px]`}>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search pages or run a command"
          aria-keyshortcuts="Control+K"
          className={`${ctl} grid place-items-center bg-white/[.08] text-soft hover:bg-white/[.13] desk:flex desk:w-auto desk:gap-2 desk:px-3.5`}
        >
          <Icon name="search" size={19} />
          <span className="hidden text-[13px] desk:inline">Search</span>
          <span className="hidden text-[11.5px] text-soft desk:inline">{isApple ? "⌘K" : "Ctrl K"}</span>
        </button>
        <button type="button" onClick={openNotifications} aria-label={bellLabel} aria-haspopup="dialog" className={`${ctl} grid place-items-center text-soft hover:bg-white/[.13] hover:text-white`}>
          <Icon name="notifications" size={20} />
          {unread > 0 && <span aria-hidden="true" className="absolute top-2 right-[9px] size-2 rounded-full bg-amber shadow-[0_0_0_2px_rgba(30,30,34,.9)]" />}
        </button>
        <button
          type="button"
          onClick={() => openAI()}
          aria-expanded={aiOpen}
          aria-label="Ask LifeOS"
          className={`${ctl} hidden w-auto items-center gap-2 bg-[rgba(10,132,255,.2)] px-3.5 text-[13px] font-semibold text-cyan-soft hover:bg-[rgba(10,132,255,.3)] desk:flex`}
        >
          <Icon name="auto_awesome" size={18} className="text-cyan" />
          Ask
          <span className="text-[11.5px] font-normal text-cyan">{mod}J</span>
        </button>
        <button
          type="button"
          onClick={() => openAI()}
          aria-expanded={aiOpen}
          aria-label="Open LifeOS assistant"
          className={`${ctl} hidden place-items-center bg-[rgba(10,132,255,.2)] text-cyan-soft hover:bg-[rgba(10,132,255,.3)] tab:grid desk:hidden`}
        >
          <Icon name="auto_awesome" size={18} className="text-cyan" />
        </button>
        <div
          role="img"
          aria-label={owner.name || owner.email}
          className={`${ctl} grid place-items-center text-[14px] font-semibold text-white`}
          style={{ background: "linear-gradient(145deg,#5e5ce6,#bf5af2)" }}
        >
          {initial}
        </div>
      </div>
    </header>
  );
}
