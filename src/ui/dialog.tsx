"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { useDialog } from "@/shell/use-dialog";

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** returns the element to focus first (e.g. Cancel) */
  initialFocus?: () => HTMLElement | null;
}) {
  const tid = useId();
  const ref = useDialog<HTMLDivElement>(open, onClose, { modal: true, initialFocus });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(5,6,9,.6)]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        className="w-[min(420px,94vw)] animate-[lo-rise_.25s_ease-out] rounded-16 border border-[rgba(255,255,255,.1)] bg-[#14161c] p-6 shadow-[var(--shadow-overlay)]"
      >
        <h2 id={tid} className="text-[17px] font-medium tracking-[-0.005em]">
          {title}
        </h2>
        <div className="mt-2 text-[13.5px] leading-normal text-text-2">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
