"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useDialog } from "@/legacy-ui/use-dialog";

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
  const ref = useDialog<HTMLDivElement>(open, onClose, {
    modal: true,
    initialFocus,
  });
  // Portal to <body>: a glass-* ancestor (backdrop-filter) would otherwise become the containing block for this fixed overlay.
  if (!open || typeof document === "undefined") return null;
  // full literals so Tailwind sees them
  const w = {
    420: ["w-[min(420px,94vw)]", "w-full tab:w-[min(420px,94vw)]"],
    480: ["w-[min(480px,94vw)]", "w-full tab:w-[min(480px,94vw)]"],
    520: ["w-[min(520px,94vw)]", "w-full tab:w-[min(520px,94vw)]"],
  }[width][sheet ? 1 : 0];
  return createPortal(
    <div
      className={`fixed inset-0 z-50 grid bg-black/40 ${sheet ? "items-end tab:place-items-center" : "place-items-center"}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        className={`${w} ${sheet ? "rounded-t-30 rounded-b-none tab:rounded-30" : "rounded-30"} glass-menu animate-[lo-rise_.25s_ease-out] overflow-hidden`}
      >
        <div
          className={`p-6 ${sheet ? "max-h-[85dvh] overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]" : "max-h-[90dvh] overflow-y-auto"}`}
        >
          <h2
            id={tid}
            className="font-display text-[26px] leading-[1.1] font-normal"
          >
            {title}
          </h2>
          <div className="mt-2 text-[13.5px] leading-normal text-text-2">
            {children}
          </div>
          <div className="mt-5 flex items-center gap-2">
            {footerStart}
            <div className="ml-auto flex gap-2">{actions}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
