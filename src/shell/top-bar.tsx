"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatHM, tzLabel } from "@/server/time";
import { Icon } from "@/ui/icon";
import { Kbd } from "@/ui/kbd";
import { useLive } from "./live-provider";
import { crumbFor } from "./nav";
import { useShell } from "./shell-provider";

export function TopBar({ owner }: { owner: { name: string; email: string } }) {
  const pathname = usePathname();
  const { openPalette, openNotifications, openAI, aiOpen, isApple } = useShell();
  const { unread } = useLive();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  const initial = (owner.name.trim() || owner.email).charAt(0).toUpperCase();
  const bellLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const box = "relative grid shrink-0 place-items-center border border-[rgba(255,255,255,.08)] bg-fill-1 text-text-2 hover:border-[rgba(255,255,255,.16)] hover:text-text";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-[rgba(255,255,255,.05)] bg-[rgba(11,12,16,.55)] px-3 backdrop-blur-[12px] tab:px-5">
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-6 bg-[linear-gradient(140deg,#8b8cff,#5b5cd6)] tab:hidden">
        <span className="size-1.5 rounded-full bg-[#0b0c10]" />
      </span>
      <div className="font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-text-3">
        LIFEOS <span className="text-text-4">/</span> <span className="text-text">{crumbFor(pathname)}</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search pages or run a command"
        aria-keyshortcuts="Control+K"
        className="flex h-11 min-w-11 items-center justify-center gap-2.5 overflow-hidden rounded-9 border border-[rgba(255,255,255,.08)] bg-fill-1 px-0 text-[13px] text-text-3 hover:border-[rgba(255,255,255,.16)] hover:text-text-2 tab:h-[34px] tab:flex-[0_1_360px] tab:justify-start tab:pr-2 tab:pl-3"
      >
        <Icon name="search" size={18} />
        <span className="hidden flex-1 truncate text-left tab:block">Search pages or run a command</span>
        <Kbd className="hidden shrink-0 tab:@min-[760px]/main:inline-block">{isApple ? "⌘ K" : "Ctrl K"}</Kbd>
      </button>
      <div className="flex-1" />
      {now && (
        <div className="hidden shrink-0 font-mono text-[11.5px] font-medium whitespace-nowrap text-text-2 tab:@min-[680px]/main:block">
          {formatHM(now)} <span className="text-text-3">{tzLabel(now)}</span>
        </div>
      )}
      <button type="button" onClick={openNotifications} aria-label={bellLabel} aria-haspopup="dialog" className={`${box} size-11 rounded-9 tab:size-[34px]`}>
        <Icon name="notifications" size={19} />
        {unread > 0 && <span aria-hidden="true" className="absolute top-1.5 right-[7px] size-[7px] rounded-full border-2 border-[#0b0c10] bg-[#a5a6ff] box-content" />}
      </button>
      <button
        type="button"
        onClick={() => openAI()}
        aria-expanded={aiOpen}
        className="hidden h-[34px] shrink-0 items-center gap-2 rounded-9 border border-[rgba(139,140,255,.35)] bg-[rgba(139,140,255,.10)] px-3 text-[13px] text-[#c7c8ff] hover:bg-[rgba(139,140,255,.18)] tab:flex"
      >
        <span aria-hidden="true" className="size-[7px] rotate-45 rounded-[2px] bg-[#8b8cff]" />
        Ask LifeOS
        <span className="font-mono text-[10.5px] text-[#8f91d9]">{isApple ? "⌘ J" : "Ctrl J"}</span>
      </button>
      <div
        role="img"
        aria-label={owner.name || owner.email}
        className="hidden size-[30px] shrink-0 place-items-center rounded-full border border-[rgba(255,255,255,.12)] bg-[linear-gradient(140deg,#2a2d3a,#1a1d24)] text-[12px] font-semibold tab:grid"
      >
        {initial}
      </div>
    </header>
  );
}
