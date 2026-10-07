import type { ReactNode } from "react";

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={`rounded-5 border border-[rgba(255,255,255,.10)] px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium text-text-2 ${className}`}>
      {children}
    </kbd>
  );
}
