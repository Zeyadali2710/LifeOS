"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { snoozePresets } from "@/server/time";

export function SnoozeMenu({ anchor, onSelect, onClose }: { anchor: HTMLElement; onSelect: (until: Date) => void; onClose: () => void }) {
  const [presets] = useState(() => snoozePresets(new Date()));
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos] = useState(() => {
    const r = anchor.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 170;
    return { right: Math.max(8, window.innerWidth - r.right), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
  });

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [anchor, onClose]);

  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[idx]?.focus();
  }, [idx]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation(); // menu only; the drawer stays open
      e.preventDefault();
      onClose();
      anchor.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => (i + 1) % presets.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => (i - 1 + presets.length) % presets.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Snooze until"
      onKeyDown={onKeyDown}
      style={pos}
      className="fixed z-[80] min-w-[200px] animate-[lo-rise_160ms_ease-out] glass-menu rounded-16 p-1"
    >
      {presets.map((p, i) => (
        <button
          key={p.key}
          type="button"
          role="menuitem"
          tabIndex={i === idx ? 0 : -1}
          onClick={() => onSelect(p.until)}
          onMouseEnter={() => setIdx(i)}
          className="flex h-8 w-full items-center justify-between gap-4 rounded-10 px-2.5 text-left text-[12.5px] hover:bg-white/[.10] focus:bg-white/[.10] focus:outline-none"
        >
          {p.label}
          <span className="font-mono text-[11px] text-text-3">{p.hint}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
