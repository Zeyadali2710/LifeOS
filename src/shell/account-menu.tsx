"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "@/ui/icon";
import { isCurrent, MORE_ITEMS } from "./nav";
import { useShell } from "./shell-provider";
import { SystemBlock, useSystemState } from "./system-block";

/** Avatar button that opens the account menu: Knowledge, Goals, Settings, system status, Sign out. */
export function AccountMenu({ owner, version }: { owner: { name: string; email: string }; version: string }) {
  const pathname = usePathname();
  const { isApple, signOut } = useShell();
  const { attention } = useSystemState();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentIdx = MORE_ITEMS.findIndex((n) => isCurrent(pathname, n.href));
  const current = currentIdx >= 0 ? MORE_ITEMS[currentIdx] : null;
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const name = owner.name.trim() || owner.email;
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    items()[Math.max(currentIdx, 0)]?.focus();
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !trigRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only on open
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigRef.current?.focus();
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  const hint = (shortcut?: string) => {
    if (!shortcut) return "";
    if (!isApple) return shortcut;
    return shortcut.replace("Alt+", "⌥").replace("Ctrl+", "⌘");
  };

  const item = "flex h-11 w-full items-center gap-3 rounded-14 px-3 text-left text-[14px] text-text hover:bg-white/[.10] hover:text-text focus-visible:bg-white/[.10] focus-visible:outline-none";

  return (
    <div className="relative">
      <button
        ref={trigRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={current ? `Account menu, ${name}: ${current.label}` : `Account menu, ${name}`}
        onClick={() => setOpen((o) => !o)}
        className={`relative grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)] [@media(pointer:coarse)]:size-11 ${
          current || open ? "ring-2 ring-white/40" : ""
        }`}
        style={{ background: "linear-gradient(145deg,#5e5ce6,#bf5af2)" }}
      >
        {initial}
        {attention && (
          <span
            aria-hidden="true"
            className={`absolute top-0 right-0 size-2.5 rounded-full shadow-[0_0_0_2px_rgba(30,30,34,.9)] ${attention === "red" ? "bg-red" : "bg-amber"}`}
          />
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onKeyDown}
          className="glass-menu absolute top-[calc(100%+14px)] right-[-5px] z-40 min-w-[240px] animate-[lo-rise_.16s_ease-out] rounded-24 p-1.5"
        >
          <div className="px-3 pt-2 pb-2.5">
            <div className="truncate text-[14px] font-medium text-text">{name}</div>
            {owner.name.trim() && <div className="truncate text-[12px] text-text-3">{owner.email}</div>}
          </div>
          {MORE_ITEMS.map((n) => {
            const cur = isCurrent(pathname, n.href);
            return (
              <Link
                key={n.key}
                href={n.href}
                role="menuitem"
                tabIndex={-1}
                aria-current={cur ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`${item} ${cur ? "bg-white/[.12]" : ""}`}
              >
                <Icon name={n.icon} size={20} fill={cur} className={cur ? "text-cyan" : "text-text-2"} />
                <span className="flex-1">{n.label}</span>
                <span className="text-[11px] text-text-3">{hint(n.shortcut)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className={item}
          >
            <Icon name="logout" size={20} className="text-text-2" />
            <span className="flex-1">Sign out</span>
          </button>
          <SystemBlock version={version} />
        </div>
      )}
    </div>
  );
}
