"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "@/ui/icon";
import { isCurrent, MORE_ITEMS } from "./nav";
import { useShell } from "./shell-provider";
import { SystemBlock, useSystemState } from "./system-block";

export function MoreMenu({ version }: { version: string }) {
  const pathname = usePathname();
  const { isApple } = useShell();
  const { attention } = useSystemState();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentIdx = MORE_ITEMS.findIndex((n) => isCurrent(pathname, n.href));
  const current = currentIdx >= 0 ? MORE_ITEMS[currentIdx] : null;
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

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

  return (
    <div className="relative">
      <button
        ref={trigRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={current ? `More: ${current.label}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-10 items-center gap-1 rounded-full px-[9px] text-[13.5px] transition-[background-color,color] duration-150 wide:pr-[10px] wide:pl-[13px] ${
          current ? "bg-white/[.16] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)]" : "text-soft hover:text-white"
        }`}
      >
        <span className="hidden wide:inline">{current ? current.label : "More"}</span>
        <Icon name="expand_more" size={20} />
        {attention && (
          <span aria-hidden="true" className={`absolute top-1.5 right-1.5 size-2 rounded-full ${attention === "red" ? "bg-red" : "bg-amber"}`} />
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="More"
          onKeyDown={onKeyDown}
          className="glass-menu absolute top-[calc(100%+14px)] right-[-5px] min-w-[230px] animate-[lo-rise_.16s_ease-out] rounded-24 p-1.5"
        >
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
                className={`flex h-11 items-center gap-3 rounded-16 px-3 text-[14px] text-text no-underline hover:bg-white/[.10] hover:text-text hover:no-underline focus-visible:bg-white/[.10] ${cur ? "bg-white/[.12]" : ""}`}
              >
                <Icon name={n.icon} size={20} fill={cur} className={cur ? "text-cyan" : "text-text-2"} />
                <span className="flex-1">{n.label}</span>
                <span className="text-[11px] text-text-3">{hint(n.shortcut)}</span>
              </Link>
            );
          })}
          <SystemBlock version={version} />
        </div>
      )}
    </div>
  );
}
