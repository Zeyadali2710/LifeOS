"use client";

import { CATEGORY, CATEGORY_KEYS, type CategoryKey } from "@/lib/calendar-categories";
import { Button } from "@/ui/button";

export function CategoryLegend({ hidden, onToggle, onShowAll }: { hidden: Set<CategoryKey>; onToggle(k: CategoryKey): void; onShowAll(): void }) {
  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto">
      <ul className="flex shrink-0 gap-1.5" aria-label="Categories">
        {CATEGORY_KEYS.map((k) => {
          const off = hidden.has(k);
          const c = CATEGORY[k];
          return (
            <li key={k}>
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(k)}
                className={`flex h-7 items-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.04] px-2.5 text-[12px] text-text-2 hover:text-text [@media(pointer:coarse)]:h-11 ${off ? "opacity-40" : ""}`}
                style={off ? undefined : { borderColor: c.color + "66" }}
              >
                <span className="size-2 rounded-2" style={{ background: c.color }} />
                {c.label}
              </button>
            </li>
          );
        })}
      </ul>
      {hidden.size > 0 && (
        <>
          <span className="shrink-0 font-mono text-[11px] text-text-3">{hidden.size} categories hidden</span>
          <Button variant="ghost" size="xs" onClick={onShowAll} className="shrink-0">
            Show all
          </Button>
        </>
      )}
    </div>
  );
}
