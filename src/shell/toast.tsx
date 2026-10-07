"use client";

import { Icon } from "@/ui/icon";

export type ToastState = { id: number; message: string; kind: "success" | "error" } | null;

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottombar-h)+env(safe-area-inset-bottom)+12px)] z-[90] flex justify-center tab:inset-x-auto tab:right-6 tab:bottom-6 tab:justify-end"
    >
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-auto flex max-w-[calc(100vw-32px)] animate-[lo-rise_200ms_ease-out] items-center gap-2.5 rounded-10 border border-[rgba(255,255,255,.10)] bg-raised px-3.5 py-[11px] text-[13px] text-text shadow-toast"
        >
          <Icon name={toast.kind === "error" ? "error" : "check_circle"} size={18} className={toast.kind === "error" ? "text-red" : "text-green"} />
          {toast.message}
        </div>
      )}
    </div>
  );
}
