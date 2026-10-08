"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatBlockCode, ThreadDTO, ThreadDetailDTO, TurnDTO } from "@/lib/agent-types";
import { cancelRunAction } from "@/server/agent-actions";
import { useLiveEvents } from "../live-provider";
import { applyChatEvent, PENDING_TURN, readNdjson } from "./chat-state";

const CODES: ChatBlockCode[] = ["no_key", "cap", "paused", "rate_limited", "invalid"];

export function useChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnDTO[]>([]);
  const [threads, setThreads] = useState<ThreadDTO[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [block, setBlock] = useState<ChatBlockCode | null>(null);
  const [capUsd, setCapUsd] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const live = useRef({ threadId, turns, streaming });
  useEffect(() => {
    live.current = { threadId, turns, streaming };
  });

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads", { cache: "no-store" });
      if (res.ok) setThreads(((await res.json()) as { items: ThreadDTO[] }).items);
    } catch {
      // keep the last list
    }
  }, []);

  const fetchThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/threads/${id}`, { cache: "no-store" });
      if (res.status === 401) return void window.location.assign("/login");
      if (!res.ok) return;
      const d = (await res.json()) as ThreadDetailDTO;
      if (live.current.streaming) return;
      setThreadId(d.thread.id);
      setTurns(d.turns);
    } catch {
      // next live frame retries
    }
  }, []);

  const openThread = useCallback((id: string) => fetchThread(id), [fetchThread]);

  const newThread = useCallback(() => {
    if (live.current.streaming) return;
    setThreadId(null);
    setTurns([]);
  }, []);

  /** Resolves true when the prompt was accepted (caller clears the draft); false keeps the draft. */
  const send = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (live.current.streaming) return false;
      setBlock(null);
      setStreaming(true);
      setTurns((t) => [...t, { id: PENDING_TURN, prompt, at: new Date().toISOString(), run: null, steps: [], approvals: [] }]);
      const dropPending = () => setTurns((t) => t.filter((x) => x.id !== PENDING_TURN));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, threadId: live.current.threadId ?? undefined }),
        });
        if (res.status === 401) {
          window.location.assign("/login");
          return false;
        }
        if (!res.ok || !res.body) {
          dropPending();
          const j = (await res.json().catch(() => ({}))) as { code?: string; capUsd?: number };
          setBlock(CODES.includes(j.code as ChatBlockCode) ? (j.code as ChatBlockCode) : "invalid");
          if (typeof j.capUsd === "number") setCapUsd(j.capUsd);
          return false;
        }
        for await (const e of readNdjson(res.body.getReader())) {
          if (e.k === "run") setThreadId(e.threadId);
          if (e.k === "done") setAnnounce(e.run.status === "failed" ? "Run failed" : "LifeOS finished");
          setTurns((t) => applyChatEvent(t, e));
        }
        return true;
      } catch {
        // stream dropped: the run may still be going server-side, resync from the thread
        const id = live.current.threadId;
        if (id) live.current.streaming = false;
        if (id) void fetchThread(id);
        return true;
      } finally {
        setStreaming(false);
        void loadThreads();
      }
    },
    [fetchThread, loadThreads],
  );

  const stop = useCallback((runId: string) => cancelRunAction(runId), []);

  // Worker-resumed runs and approvals decided elsewhere arrive as live frames: refetch the open thread.
  const refetch = (ids: (string | null | undefined)[] | null) => {
    const { threadId: id, turns: ts, streaming: s } = live.current;
    if (!id || s) return;
    if (ids && !ts.some((t) => ids.includes(t.id))) return;
    void fetchThread(id);
  };
  useLiveEvents("run", (dto) => refetch(dto ? [dto.id, dto.parentRunId] : null));
  useLiveEvents("approval", (dto) => refetch(dto ? [dto.runId] : null));

  return { threadId, turns, threads, streaming, block, capUsd, announce, send, stop, newThread, openThread, loadThreads, clearBlock: () => setBlock(null) };
}
