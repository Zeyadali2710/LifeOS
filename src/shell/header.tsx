"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/icon";
import { AccountMenu } from "./account-menu";
import { isCurrent, PRIMARY_ITEMS } from "./nav";
import { useShell } from "./shell-provider";
import { useSystemState } from "./system-block";
import { useAgentStatus } from "./use-agent-status";
import { useLive } from "./live-provider";

function cap(n: number) {
  return n > 99 ? "99+" : String(n);
}

const pill = "glass-chrome rounded-full h-[50px] [@media(pointer:coarse)]:h-[54px] flex items-center gap-1 p-[5px] pointer-events-auto";
const ctl = "relative grid size-10 shrink-0 place-items-center rounded-full [@media(pointer:coarse)]:size-11";

export function Header({ owner, version }: { owner: { name: string; email: string }; version: string }) {
  const pathname = usePathname();
  const { openPalette, openNotifications, openAI, aiOpen, isApple } = useShell();
  const { unread } = useLive();
  const waiting = useAgentStatus().status?.approvalsWaiting ?? 0;
  const { healthRow } = useSystemState();

  const bellLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const mod = isApple ? "⌘" : "Ctrl ";

  return (
    <header className="pointer-events-none fixed inset-x-4 top-[14px] z-[45] flex items-center gap-2.5">
      <span className="sr-only" role="status">
        {healthRow.text}
      </span>

      {/* Logo + primary nav share one pill */}
      <div className={`${pill} shrink-0`}>
        <Link
          href="/"
          aria-label="LifeOS home"
          className="flex h-10 items-center gap-2 rounded-full pr-3 pl-2.5 text-[15px] font-semibold text-text hover:text-text [@media(pointer:coarse)]:h-11"
        >
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded-full"
            style={{ background: "radial-gradient(circle at 30% 30%, #fff, #64d2ff 40%, #0a84ff 70%, #5e5ce6)" }}
          />
          <span className="hidden mid:inline">LifeOS</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-0.5 tab:flex">
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
                className={`group relative flex h-10 min-w-10 items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 justify-center gap-1.5 rounded-full px-2.5 transition-[background-color,color] duration-150 ${
                  cur ? "bg-white/[.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)] hover:text-white" : "text-soft hover:bg-white/[.08] hover:text-white"
                }`}
              >
                <Icon name={n.icon} size={20} fill={cur} />
                {badge > 0 && (
                  <span aria-hidden="true" className="rounded-full bg-amber px-1.5 text-[11px] leading-[18px] font-bold text-on-accent">
                    {cap(badge)}
                  </span>
                )}
                <span
                  id={tipId}
                  role="tooltip"
                  className="glass-menu pointer-events-none absolute top-[calc(100%+12px)] left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2.5 rounded-10 px-2.5 py-[7px] text-[12.5px] whitespace-nowrap text-text group-hover:flex group-focus-visible:flex"
                >
                  {n.label}
                  {n.shortcut && <span className="text-[11px] text-soft">{n.shortcut}</span>}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Search fills the space between the nav pill and the actions */}
      <div className={`${pill} min-w-0 flex-1`}>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search pages or run a command"
          aria-keyshortcuts="Control+K"
          className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white/[.08] px-3.5 text-left text-[13.5px] text-soft hover:bg-white/[.13] hover:text-white [@media(pointer:coarse)]:h-11"
        >
          <Icon name="search" size={19} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search</span>
          <span className="hidden shrink-0 text-[11.5px] text-soft tab:inline">{isApple ? "⌘K" : "Ctrl K"}</span>
        </button>
        <button type="button" onClick={openNotifications} aria-label={bellLabel} aria-haspopup="dialog" className={`${ctl} text-soft hover:bg-white/[.10] hover:text-white`}>
          <Icon name="notifications" size={21} />
          {unread > 0 && <span aria-hidden="true" className="absolute top-2.5 right-2.5 size-2 rounded-full bg-amber shadow-[0_0_0_2px_rgba(30,30,34,.9)]" />}
        </button>
        <button
          type="button"
          onClick={() => openAI()}
          aria-expanded={aiOpen}
          aria-label="Ask LifeOS"
          className="hidden h-10 shrink-0 items-center gap-2 rounded-full bg-[rgba(10,132,255,.2)] px-3.5 text-[13px] font-semibold text-cyan-soft hover:bg-[rgba(10,132,255,.3)] desk:flex"
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
          className={`${ctl} hidden bg-[rgba(10,132,255,.2)] text-cyan-soft hover:bg-[rgba(10,132,255,.3)] tab:grid desk:hidden`}
        >
          <Icon name="auto_awesome" size={18} className="text-cyan" />
        </button>
        <AccountMenu owner={owner} version={version} />
      </div>
    </header>
  );
}
