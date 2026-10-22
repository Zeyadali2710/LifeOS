"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  opts: { modal: boolean; initialFocus?: () => HTMLElement | null },
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  const initialRef = useRef(opts.initialFocus);
  const { modal } = opts;
  useEffect(() => {
    closeRef.current = onClose;
    initialRef.current = opts.initialFocus;
  });

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const opener = document.activeElement as HTMLElement | null;
    (initialRef.current?.() ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (!modal || e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, modal]);

  return ref;
}
