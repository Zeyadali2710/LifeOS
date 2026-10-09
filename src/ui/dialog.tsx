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
  width = 420,
  sheet = false,
  footerStart,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** returns the element to focus first (e.g. Cancel) */
  initialFocus?: () => HTMLElement | null;
  width?: 420 | 480 | 520;
  /** bottom sheet below the tab breakpoint */
  sheet?: boolean;
  /** left-aligned slot in the actions row (e.g. destructive "Delete") */
  footerStart?: ReactNode;
}) {
  const tid = useId();
  const ref = useDialog<HTMLDivElement>(open, onClose, { modal: true, initialFocus });
  if (!open) return null;
  // full literals so Tailwind sees them
  const w = {
    420: ["w-[min(420px,94vw)]", "w-full tab:w-[min(420px,94vw)]"],
    480: ["w-[min(480px,94vw)]", "w-full tab:w-[min(480px,94vw)]"],
    520: ["w-[min(520px,94vw)]", "w-full tab:w-[min(520px,94vw)]"],
  }[width][sheet ? 1 : 0];
  return (
    <div className={`fixed inset-0 z-50 grid bg-[rgba(5,6,9,.6)] ${sheet ? "items-end tab:place-items-center" : "place-items-center"}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        className={`${sheet ? `${w} max-h-[85dvh] overflow-y-auto rounded-t-16 rounded-b-none tab:rounded-16 pb-[max(1.5rem,env(safe-area-inset-bottom))]` : `${w} rounded-16 pb-6`} animate-[lo-rise_.25s_ease-out] border border-[rgba(255,255,255,.1)] bg-[#14161c] px-6 pt-6 shadow-[var(--shadow-overlay)]`}
      >
        <h2 id={tid} className="text-[17px] font-medium tracking-[-0.005em]">
          {title}
        </h2>
        <div className="mt-2 text-[13.5px] leading-normal text-text-2">{children}</div>
        <div className="mt-5 flex items-center gap-2">
          {footerStart}
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      </div>
    </div>
  );
}
