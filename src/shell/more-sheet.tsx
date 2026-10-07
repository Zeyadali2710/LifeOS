"use client";

import Link from "next/link";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { useLive } from "./live-provider";
import { useShell } from "./shell-provider";
import { useDialog } from "./use-dialog";

const row = "flex h-[52px] w-full items-center gap-3 rounded-10 px-3 text-left text-[14px] text-text hover:bg-fill-2";

function Tile({ icon }: { icon: IconName }) {
  return (
    <span className="grid size-[26px] place-items-center rounded-7 bg-fill-2 text-text-2">
      <Icon name={icon} size={17} />
    </span>
  );
}

export function MoreSheet() {
  const { moreOpen, setMoreOpen, openNotifications, openPalette, signOut } = useShell();
  const { unread } = useLive();
  const close = () => setMoreOpen(false);
  const ref = useDialog<HTMLDivElement>(moreOpen, close, { modal: true });
  if (!moreOpen) return null;

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/career", label: "Career", icon: "terminal" },
    { href: "/socials", label: "Socials", icon: "public" },
    { href: "/outreach", label: "Outreach", icon: "hub" },
    { href: "/knowledge", label: "Knowledge", icon: "library_books" },
    { href: "/goals", label: "Goals", icon: "flag" },
    { href: "/agents", label: "Agents", icon: "memory" },
    { href: "/approvals", label: "Approvals", icon: "verified_user" },
  ];
  const chevron = <Icon name="chevron_right" size={18} className="text-text-4" />;

  return (
    <div className="fixed inset-0 z-[70] tab:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(5,6,9,.6)]" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-[lo-rise_200ms_ease-out] overflow-y-auto rounded-t-16 border-t border-[rgba(255,255,255,.10)] bg-[#12141a] p-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-overlay"
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={close} className={row}>
            <Tile icon={l.icon} />
            <span className="flex-1">{l.label}</span>
            {chevron}
          </Link>
        ))}
        <button
          type="button"
          className={row}
          onClick={() => {
            close();
            openNotifications();
          }}
        >
          <Tile icon="notifications" />
          <span className="flex-1">Notifications</span>
          {unread > 0 && <span className="rounded-full bg-[rgba(255,255,255,.12)] px-1.5 py-0.5 font-mono text-[10.5px]">{unread > 99 ? "99+" : unread}</span>}
          {chevron}
        </button>
        <button
          type="button"
          className={row}
          onClick={() => {
            close();
            openPalette();
          }}
        >
          <Tile icon="search" />
          <span className="flex-1">Search</span>
          {chevron}
        </button>
        <Link href="/settings" onClick={close} className={row}>
          <Tile icon="tune" />
          <span className="flex-1">Settings</span>
          {chevron}
        </Link>
        <Button
          variant="ghost"
          size="touch"
          className="mt-1 w-full"
          onClick={async () => {
            close();
            await signOut();
          }}
        >
          <Icon name="logout" size={18} />
          Sign out
        </Button>
      </div>
    </div>
  );
}
