"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { NAV_ITEMS, SECONDARY_ITEMS, isCurrent } from "./nav";
import { useShell } from "./shell-provider";
import { SystemBlock } from "./system-block";
import { useDialog } from "./use-dialog";

export const MORE_SHEET_KEYS = ["career", "socials", "outreach", "organization", "finances", "projects", "knowledge", "goals", "briefings", "automations", "settings"];

const links = MORE_SHEET_KEYS.map((k) => [...NAV_ITEMS, ...SECONDARY_ITEMS].find((n) => n.key === k)!);

export function MoreSheet({ version }: { version: string }) {
  const pathname = usePathname();
  const { moreOpen, setMoreOpen, signOut } = useShell();
  const close = () => setMoreOpen(false);
  const ref = useDialog<HTMLDivElement>(moreOpen, close, { modal: true });
  if (!moreOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] tab:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="glass-menu fixed right-3 bottom-[calc(96px+env(safe-area-inset-bottom))] left-3 z-[70] max-h-[75dvh] animate-[lo-rise_.16s_ease-out] overflow-y-auto rounded-30 p-2"
      >
        <div className="grid grid-cols-2 gap-1">
          {links.map((l) => {
            const current = isCurrent(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                aria-current={current ? "page" : undefined}
                className={`flex h-[52px] items-center gap-2.5 rounded-16 px-3 text-[14px] text-white ${current ? "bg-white/[.12]" : "hover:bg-white/[.08]"}`}
              >
                <Icon name={l.icon} size={21} fill={current} />
                {l.label}
              </Link>
            );
          })}
        </div>
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
        <SystemBlock version={version} />
      </div>
    </div>
  );
}
