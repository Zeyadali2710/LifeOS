"use client";

import { Icon } from "@/ui/icon";
import { useShell } from "./shell-provider";

const CHIPS = ["What needs my attention?", "Plan my week", "Find events this weekend"];

export function AskBar() {
  const { aiOpen, openAI, isApple } = useShell();
  if (aiOpen) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[22px] z-20 hidden justify-center px-6 tab:flex">
      <div className="pointer-events-auto flex w-[min(640px,100%)] flex-col gap-2.5">
        <div className="flex flex-wrap justify-center gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} type="button" onClick={() => openAI(c)} className="glass-chrome h-8 rounded-full px-3.5 text-[12.5px] text-soft hover:text-white">
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => openAI()}
          aria-label="Ask LifeOS anything"
          className="glass-ask flex h-[58px] items-center gap-3 rounded-full pr-[9px] pl-[22px] transition-[border-color] hover:border-white/25"
        >
          <span aria-hidden="true" className="size-2.5 shrink-0 animate-[lo-pulse_2.6s_ease-out_infinite] rounded-full bg-accent" />
          <span className="flex-1 text-left font-display text-[20px] leading-none text-soft italic">Ask LifeOS anything…</span>
          <Icon name="mic" size={21} className="text-soft" aria-hidden="true" />
          <span className="grid h-10 place-items-center rounded-full bg-white/[.10] px-3.5 text-[12px] text-soft">{isApple ? "⌘ J" : "Ctrl J"}</span>
        </button>
      </div>
    </div>
  );
}
