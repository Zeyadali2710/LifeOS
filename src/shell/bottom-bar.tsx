"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { isCurrent } from "./nav";
import { useShell } from "./shell-provider";

const slot = "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 text-[10.5px]";

function LinkSlot({ href, icon, label, current }: { href: string; icon: IconName; label: string; current: boolean }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`${slot} ${current ? "text-text" : "text-text-3"}`}>
      <Icon name={icon} size={22} fill={current} className={current ? "text-[#a5a6ff]" : ""} />
      {label}
    </Link>
  );
}

export function BottomBar() {
  const pathname = usePathname();
  const { openAI, moreOpen, setMoreOpen } = useShell();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-[rgba(255,255,255,.07)] bg-[rgba(11,12,16,.9)] px-2 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px] tab:hidden"
      style={{ height: "calc(var(--bottombar-h) + env(safe-area-inset-bottom))" }}
    >
      <LinkSlot href="/" icon="space_dashboard" label="Home" current={isCurrent(pathname, "/")} />
      <LinkSlot href="/organization" icon="calendar_month" label="Organize" current={isCurrent(pathname, "/organization")} />
      <button
        type="button"
        onClick={() => openAI()}
        aria-label="Open LifeOS assistant"
        className="mx-auto -mt-[22px] grid size-14 place-items-center rounded-[18px] bg-[linear-gradient(160deg,#9a9bff,#6c6de6)] shadow-[0_0_0_5px_#0b0c10,0_10px_30px_rgba(110,112,255,.45)]"
      >
        <span aria-hidden="true" className="size-3.5 rotate-45 rounded-[3px] bg-[#0b0c10]" />
      </button>
      <LinkSlot href="/projects" icon="deployed_code" label="Projects" current={isCurrent(pathname, "/projects")} />
      <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={`${slot} text-text-3`}>
        <Icon name="more_horiz" size={22} />
        More
      </button>
    </nav>
  );
}
