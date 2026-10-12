"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ExecutionTrace } from "@/agents/execution-trace";
import type { ChatBlockCode } from "@/lib/agent-types";
import { formatHM } from "@/server/time";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { InlineError } from "@/ui/inline-error";
import { ApprovalCard } from "./ai/approval-card";
import { RecentThreads } from "./ai/recent-threads";
import { ResultCard } from "./ai/result-card";
import { useChat } from "./ai/use-chat";
import { useShell } from "./shell-provider";
import { useAgentStatus } from "./use-agent-status";
import { useDialog } from "./use-dialog";

type Mode = "docked" | "overlay" | "sheet";

const SUB_LABEL = { ready: "ONLINE", working: "WORKING", paused: "PAUSED", cap: "SPEND CAP REACHED", no_key: "NOT CONNECTED" } as const;

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const getMode = (): Mode => (window.innerWidth >= 1100 ? "docked" : window.innerWidth >= 760 ? "overlay" : "sheet");

export function AIPanel() {
  const { aiOpen, closeAI, consumeAIPrompt, toast } = useShell();
  const router = useRouter();
  const { status } = useAgentStatus();
  const chat = useChat();
  const { turns, streaming, loadThreads, send } = chat;
  const mode = useSyncExternalStore(subscribe, getMode, () => "docked" as Mode);
  const [draft, setDraft] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Esc steps back from Recent first, then closes. It never cancels a run.
  const ref = useDialog<HTMLElement>(aiOpen, () => (showRecent ? setShowRecent(false) : closeAI()), {
    modal: mode !== "docked",
    initialFocus: () => areaRef.current,
  });

  const assistant = status?.assistant ?? "ready";
  const blockCode: ChatBlockCode | null = chat.block ?? (assistant === "cap" || assistant === "no_key" || assistant === "paused" ? (assistant === "cap" ? "cap" : assistant) : null);
  const blocked = blockCode === "cap" || blockCode === "no_key" || blockCode === "paused";
  const capUsd = chat.capUsd ?? status?.capUsd ?? 0;

  const submit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || blocked || streaming) return;
    setDraft("");
    const ok = await send(prompt);
    if (!ok) setDraft((d) => d || text);
  };

  useEffect(() => {
    if (!aiOpen || !status) return; // wait for status so a blocked assistant (no key, cap) never POSTs
    const t = setTimeout(() => {
      const p = consumeAIPrompt(); // deferred so setState never runs synchronously in the effect
      if (p) void submit(p);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is recreated each render; only the open edge should consume a prompt
  }, [aiOpen, status === null, consumeAIPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);

  useEffect(() => {
    if (chat.block === "rate_limited") toast("Too many requests. Wait a moment, then try again.", "error");
    else if (chat.block === "invalid") toast("That request couldn't be sent. Try again.", "error");
  }, [chat.block, toast]);

  if (!aiOpen) return null;

  const activeRunId = streaming ? [...turns].reverse().find((t) => t.run)?.run?.id : undefined;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(draft);
    }
  };
  const iconBtn = "grid size-[30px] place-items-center rounded-8 text-text-2 hover:bg-white/[.06] hover:text-text [@media(pointer:coarse)]:size-11";
  const modal = mode !== "docked";
  const repoRows: { icon: IconName; text: string }[] = [
    { icon: "priority_high", text: "What's happening in my repos?" },
    { icon: "code", text: "Which pull requests need my review?" },
    { icon: "check_circle", text: "Is CI passing on my default branches?" },
    ...(status?.firstRepo ? [{ icon: "edit_note" as IconName, text: `Create an issue in ${status.firstRepo}` }] : []),
  ];
  const org: { icon: IconName; text: string }[] = [
    { icon: "event", text: "What's on my calendar this week?" },
    { icon: "schedule", text: "When am I free on Thursday?" },
    { icon: "event_busy", text: "Do I have any conflicts?" },
    { icon: "task_alt", text: "What's due today?" },
  ];
  // Four rows total: two of each when both are connected, all Organization when there is no repo.
  const examples = !status?.calendarConnected ? repoRows : status.firstRepo ? [...repoRows.slice(0, 2), ...org.slice(0, 2)] : org;

  const newConversation = () => {
    if (turns.length > 0) chat.newThread();
    setShowRecent(false);
    areaRef.current?.focus();
  };
  const toggleRecent = () => {
    if (!showRecent) void loadThreads();
    setShowRecent(!showRecent);
  };

  const blockedError = blockCode === "cap" ? (
    <InlineError
      label="ERROR · SPEND CAP"
      title="LifeOS can't start a new run."
      what="Your request wasn't sent."
      why={`This month's AI spend reached the US$${capUsd} cap.`}
      fix="Raise the cap in Settings. Runs already in progress will finish."
      action={{ label: "OPEN SETTINGS", onClick: () => router.push("/settings?section=ai") }}
    />
  ) : blockCode === "no_key" ? (
    <InlineError
      label="ERROR · ORCHESTRATOR"
      icon="link_off"
      title="LifeOS can't answer yet."
      what="Your request wasn't sent anywhere."
      why="The Anthropic API key isn't configured on the server."
      fix="Set ANTHROPIC_API_KEY in the server environment and restart LifeOS."
    />
  ) : blockCode === "paused" ? (
    <InlineError
      label="ERROR · PAUSED"
      icon="block"
      title="LifeOS can't start a new run."
      what="Your request wasn't sent."
      why="New runs are paused."
      fix="Resume runs in the Command Centre. Running work will finish."
      action={{ label: "OPEN AGENTS", onClick: () => router.push("/agents") }}
    />
  ) : null;

  const panel = (
    <aside
      ref={ref}
      aria-label="LifeOS assistant"
      {...(modal ? { role: "dialog", "aria-modal": true } : {})}
      className="glass-panel absolute top-[80px] right-3 bottom-3 z-[60] flex w-[min(440px,calc(100%-24px))] animate-[lo-slide_.2s_ease] flex-col overflow-hidden rounded-30"
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[.06] px-5 pr-4">
        <span aria-hidden="true" className="size-[9px] rotate-45 rounded-[2px] bg-accent" />
        <div className="flex flex-col">
          <span className="font-display text-[22px] leading-[1.15] italic">LifeOS</span>
          <span className={`flex items-center gap-1.5 text-[10px] font-medium tracking-[.12em] ${assistant === "cap" ? "text-text-2" : "text-text-3"}`}>
            {assistant === "cap" && <span aria-hidden="true" className="size-1.5 rounded-full bg-red" />}
            ORCHESTRATOR · {SUB_LABEL[assistant]}
          </span>
        </div>
        <div className="flex-1" />
        <button type="button" aria-label="New conversation" onClick={newConversation} className={iconBtn}>
          <Icon name="edit_square" size={18} />
        </button>
        <button type="button" aria-label="Recent conversations" aria-expanded={showRecent} onClick={toggleRecent} className={iconBtn}>
          <Icon name="history" size={18} />
        </button>
        <button type="button" aria-label="Close assistant" onClick={closeAI} className={iconBtn}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showRecent ? (
          <RecentThreads
            threads={chat.threads}
            currentId={chat.threadId}
            onSelect={(id) => {
              void chat.openThread(id);
              setShowRecent(false);
              areaRef.current?.focus();
            }}
          />
        ) : turns.length === 0 ? (
          <div className="flex flex-col gap-4 p-5">
            <h2 className="font-display text-[32px] leading-[1.05]">What should we <em>look at?</em></h2>
            <p className="text-[13.5px] leading-normal text-text-2">
              Ask about your repositories, pull requests and CI{status?.calendarConnected ? ", or look at your calendar and tasks" : ""}. Anything that creates or changes something waits for your approval.
            </p>
            <div className="text-[10px] font-medium tracking-[.12em] text-text-3">EXAMPLES</div>
            <div className="flex flex-col gap-2">
              {examples.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  disabled={blocked || streaming}
                  onClick={() => void submit(s.text)}
                  className="flex min-h-11 items-center gap-2.5 rounded-16 border border-white/[.10] bg-white/[.02] px-3 py-2.5 text-left text-[13.5px] hover:border-[rgba(10,132,255,.35)] hover:bg-[rgba(10,132,255,.06)] disabled:opacity-50"
                >
                  <Icon name={s.icon} size={17} className="text-accent" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={t.id} className="flex animate-[lo-fade_250ms_ease-out] flex-col gap-3 border-b border-white/[.05] p-5">
              <div className="text-[10px] font-medium tracking-[.12em] text-text-3">YOU · {formatHM(new Date(t.at))}</div>
              <p className="font-display text-[22px] leading-[1.15] break-words whitespace-pre-wrap">{t.prompt}</p>
              {t.steps.length > 0 && <ExecutionTrace steps={t.steps} size="panel" runHref={t.run ? `/agents/runs/${t.run.id}` : undefined} />}
              {t.approvals.map((a) => (
                <ApprovalCard key={a.id} approval={a} onDecided={() => void (chat.threadId && chat.openThread(chat.threadId))} />
              ))}
              <ResultCard
                turn={t}
                streaming={streaming && i === turns.length - 1}
                onRetried={() => void (chat.threadId && chat.openThread(chat.threadId))}
              />
            </div>
          ))
        )}
        {!showRecent && blockedError && <div className="p-5">{blockedError}</div>}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-white/[.06] px-3.5 pt-3 pb-3.5">
        <div className="rounded-22 border border-white/[.14] bg-white/[.06] p-2.5 pt-2.5 pb-2 pl-3.5 focus-within:border-[rgba(100,210,255,.55)] focus-within:shadow-[var(--ring-input)]">
          <textarea
            ref={areaRef}
            rows={2}
            aria-label="Message LifeOS"
            aria-disabled={blocked || undefined}
            placeholder={blockCode === "no_key" ? "Assistant isn't connected" : blocked ? "New runs are paused" : "Ask LifeOS anything…"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="block w-full resize-none bg-transparent text-[14px] leading-[1.45] text-text outline-none placeholder:text-text-3"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex-1 text-[10.5px] text-text-3">↵ send · ⇧↵ newline · actions need approval</span>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Voice input isn't available yet"
              aria-label="Voice input"
              className="grid size-[30px] place-items-center rounded-8 text-text-4 [@media(pointer:coarse)]:size-11"
            >
              <Icon name="mic" size={18} />
            </button>
            {streaming ? (
              <button
                type="button"
                aria-label="Stop run"
                disabled={!activeRunId}
                onClick={() => activeRunId && void chat.stop(activeRunId)}
                className="grid size-[30px] place-items-center rounded-8 bg-white/[.10] text-text [@media(pointer:coarse)]:size-11"
              >
                <Icon name="stop" size={18} />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send"
                disabled={!draft.trim() || blocked}
                onClick={() => void submit(draft)}
                className="grid size-[30px] place-items-center rounded-8 bg-accent text-on-accent disabled:bg-white/[.10] disabled:text-text-4 [@media(pointer:coarse)]:size-11"
              >
                <Icon name="arrow_upward" size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {chat.announce}
      </div>
    </aside>
  );

  return wrap(mode, panel, closeAI);
}

function wrap(mode: Mode, panel: ReactNode, close: () => void) {
  if (mode === "docked") return panel;
  return (
    <div className="fixed inset-0 z-[60]">
      <div aria-hidden="true" className="absolute inset-0 animate-[lo-fade_150ms_ease-out] bg-black/40" onClick={close} />
      {panel}
    </div>
  );
}
