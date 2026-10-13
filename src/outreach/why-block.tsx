import type { ReactNode } from "react";

/** WHY THIS IS RELEVANT: accent-tinted inset (UI-SPEC accent item 4). `score` adds the `· n/100` suffix used on the detail page. */
export function WhyBlock({ why, score, large = false, children }: { why: string; score?: number; large?: boolean; children?: ReactNode }) {
  return (
    <div className={`flex flex-col rounded-14 border border-[rgba(10,132,255,.16)] bg-[rgba(10,132,255,.06)] ${large ? "gap-3 p-4" : "gap-1 p-3"}`}>
      <p className="flex items-center gap-2 text-[11px] font-medium tracking-[.14em] text-cyan uppercase">
        <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
        {score === undefined ? "WHY THIS IS RELEVANT" : `WHY THIS IS RELEVANT · ${score}/100`}
      </p>
      <p className={large ? "text-[14px] leading-normal text-text" : "line-clamp-3 text-[12.5px] leading-normal text-text"}>{why}</p>
      {children}
    </div>
  );
}
