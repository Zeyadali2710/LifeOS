"use client";

import { Icon } from "@/ui/icon";

export type ToastState = { id: number; message: string; kind: "success" | "error" } | null;

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-[90] flex justify-center tab:bottom-[130px]"
    >
      {toast && (
        <div
          key={toast.id}
          className="glass-menu pointer-events-auto flex max-w-[calc(100vw-32px)] animate-[lo-rise_.2s_ease-out] items-center gap-2.5 rounded-full px-[18px] py-3 text-[13.5px] text-text"
        >
          <Icon name={toast.kind === "error" ? "error" : "check_circle"} size={19} className={toast.kind === "error" ? "text-red" : "text-green"} />
          {toast.message}
        </div>
      )}
    </div>
  );
}
