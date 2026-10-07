"use client";

import { Kbd } from "@/ui/kbd";
import { useShell } from "./shell-provider";

const CHIPS = ["What needs my attention?", "Plan my week", "Find events this weekend"];

export function CommandBar() {
  const { aiOpen, openAI, isApple } = useShell();
  if (aiOpen) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden justify-center px-6 tab:flex">
      <div className="flex w-[min(680px,100%)] flex-col gap-2.5">
        <div className="flex flex-wrap justify-center gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => openAI(c)}
              className="pointer-events-auto h-[26px] rounded-full border border-[rgba(255,255,255,.08)] bg-[rgba(17,19,24,.85)] px-2.5 text-[12px] text-text-2 backdrop-blur-[10px] hover:border-[rgba(139,140,255,.4)] hover:text-text"
            >
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => openAI()}
          aria-label="Ask LifeOS anything"
          className="pointer-events-auto flex h-[52px] items-center gap-3 rounded-14 border border-[rgba(139,140,255,.22)] bg-[rgba(17,19,24,.82)] pr-2.5 pl-4 shadow-float backdrop-blur-[18px] backdrop-saturate-[140%] hover:border-[rgba(139,140,255,.45)] focus-visible:border-[rgba(139,140,255,.6)] focus-visible:bg-[rgba(17,19,24,.95)]"
        >
          <span aria-hidden="true" className="size-[9px] shrink-0 rotate-45 animate-[lo-pulse_2.6s_infinite] rounded-[2px] bg-[#8b8cff]" />
          <span className="flex-1 text-left text-[14.5px] text-text-3">Ask LifeOS anything…</span>
          <Kbd className="rounded-6 px-[7px] py-1">{isApple ? "⌘ J" : "Ctrl J"}</Kbd>
        </button>
      </div>
    </div>
  );
}
