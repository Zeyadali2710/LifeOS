import type { ReactNode } from "react";

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={`rounded-5 border border-white/10 px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium text-text-2 ${className}`}>
      {children}
    </kbd>
  );
}
