"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { formatHM } from "@/server/time";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { InlineError } from "@/ui/inline-error";
import { useShell } from "./shell-provider";
import { useDialog } from "./use-dialog";

// D-05: the orchestrator is not connected. Turns live in local state only; nothing is sent anywhere.
type Turn = { id: number; prompt: string; time: string };
type Mode = "docked" | "overlay" | "sheet";

const SUGGESTIONS: { icon: IconName; text: string }[] = [
  { icon: "priority_high", text: "What needs my attention?" },
  { icon: "event_note", text: "Plan my week" },
  { icon: "travel_explore", text: "Find events this weekend" },
  { icon: "edit_note", text: "Prepare my LinkedIn post" },
];

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const getMode = (): Mode => (window.innerWidth >= 1100 ? "docked" : window.innerWidth >= 720 ? "overlay" : "sheet");

export function AIPanel() {
  const { aiOpen, closeAI, consumeAIPrompt } = useShell();
  const mode = useSyncExternalStore(subscribe, getMode, () => "docked" as Mode);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const ref = useDialog<HTMLElement>(aiOpen, closeAI, { modal: mode !== "docked", initialFocus: () => areaRef.current });

  const submit = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    setTurns((t) => [...t, { id: ++nextId.current, prompt, time: formatHM(new Date()) }]);
    setDraft("");
  };

  useEffect(() => {
    if (!aiOpen) return;
    const p = consumeAIPrompt();
    if (p) submit(p);
  }, [aiOpen, consumeAIPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns.length]);

  if (!aiOpen) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };
  const iconBtn = "grid size-11 place-items-center rounded-8 text-text-3 hover:bg-fill-2 hover:text-text tab:size-[30px]";
  const modal = mode !== "docked";

  const panel = (
    <aside
      ref={ref}
      aria-label="LifeOS assistant"
      {...(modal ? { role: "dialog", "aria-modal": true } : {})}
      className={`flex h-full w-[min(440px,92vw)] animate-[lo-slide_200ms_ease-out] flex-col border-l border-[rgba(255,255,255,.07)] bg-[linear-gradient(180deg,rgba(20,21,30,.98),rgba(13,14,19,.98))] ${
        mode === "docked" ? "shrink-0" : mode === "overlay" ? "absolute inset-y-0 right-0 shadow-overlay" : "absolute inset-0 w-full"
      }`}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[rgba(255,255,255,.06)] px-5">
        <span aria-hidden="true" className="size-[9px] rotate-45 rounded-[2px] bg-[#8b8cff]" />
        <div className="flex flex-col">
          <span className="text-[14px] leading-tight font-medium">LifeOS</span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-text-3">ORCHESTRATOR · NOT CONNECTED</span>
        </div>
        <div className="flex-1" />
        <button type="button" aria-label="New conversation" onClick={() => setTurns([])} className={iconBtn}>
          <Icon name="edit_square" size={18} />
        </button>
        <button type="button" aria-label="Close assistant" onClick={closeAI} className={iconBtn}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-4 p-5">
            <h2 className="text-[20px] leading-[1.3] font-medium tracking-[-0.01em]">What should we look at?</h2>
            <p className="text-[13px] leading-normal text-text-2">
              The assistant isn&apos;t connected yet. When it is, you can plan, search and delegate to your agents from here. Anything that sends, publishes or deletes will wait for your approval.
            </p>
            <div className="font-mono text-[10px] tracking-[0.08em] text-text-3">EXAMPLES</div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => submit(s.text)}
                  className="flex min-h-11 items-center gap-2.5 rounded-9 border border-[rgba(255,255,255,.07)] bg-fill-1 px-3 py-2.5 text-left text-[13.5px] hover:border-[rgba(139,140,255,.35)] hover:bg-[rgba(139,140,255,.06)]"
                >
                  <Icon name={s.icon} size={17} className="text-[#a5a6ff]" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="flex animate-[lo-fade_250ms_ease-out] flex-col gap-3 border-b border-[rgba(255,255,255,.05)] p-5">
              <div className="font-mono text-[10px] tracking-[0.08em] text-text-3">YOU · {t.time}</div>
              <p className="text-[16px] leading-[1.4] break-words whitespace-pre-wrap">{t.prompt}</p>
              <InlineError
                label="ERROR · ORCHESTRATOR"
                icon="link_off"
                title="LifeOS can't answer yet."
                what="Your request wasn't sent anywhere."
                why="The orchestrator isn't connected. It arrives with agents in the next phase."
                fix="Nothing to fix on your side. Use the command palette to move between pages in the meantime."
              />
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-[rgba(255,255,255,.06)] px-3.5 pt-3 pb-3.5">
        <div className="rounded-12 border border-[rgba(139,140,255,.25)] bg-fill-1 p-2.5 pt-2.5 pb-2 pl-3 focus-within:border-[rgba(139,140,255,.6)] focus-within:shadow-[0_0_0_3px_rgba(139,140,255,.15)]">
          <textarea
            ref={areaRef}
            rows={2}
            aria-label="Message LifeOS"
            placeholder="Ask LifeOS anything…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="block w-full resize-none bg-transparent text-[14px] leading-[1.45] text-text outline-none placeholder:text-text-3"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex-1 font-mono text-[10.5px] text-text-3">↵ send · ⇧↵ newline · actions need approval</span>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Voice input isn't available yet"
              aria-label="Voice input"
              className="grid size-11 place-items-center rounded-8 text-text-4 tab:size-[30px]"
            >
              <Icon name="mic" size={18} />
            </button>
            <button
              type="button"
              aria-label="Send"
              disabled={!draft.trim()}
              onClick={() => submit(draft)}
              className="grid size-11 place-items-center rounded-8 bg-[#8b8cff] text-[#0b0c10] shadow-glow-ai disabled:bg-fill-3 disabled:text-text-4 disabled:shadow-none tab:size-[30px]"
            >
              <Icon name="arrow_upward" size={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );

  return wrap(mode, panel, closeAI);
}

function wrap(mode: Mode, panel: ReactNode, close: () => void) {
  if (mode === "docked") return panel;
  return (
    <div className="fixed inset-0 z-[60]">
      {mode === "overlay" && <div aria-hidden="true" className="absolute inset-0 animate-[lo-fade_150ms_ease-out] bg-[rgba(5,6,9,.6)]" onClick={close} />}
      {panel}
    </div>
  );
}
