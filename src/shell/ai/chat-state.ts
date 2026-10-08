import type { ChatEvent, TurnDTO } from "@/lib/agent-types";

/** Id of the optimistic turn shown before the server's "run" event arrives. */
export const PENDING_TURN = "pending";

const upsert = <T extends { id: string }>(list: T[], item: T, order?: (a: T, b: T) => number): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  const next = i === -1 ? [...list, item] : list.map((x, j) => (j === i ? item : x));
  return order ? next.sort(order) : next;
};

const turnOf = (turns: TurnDTO[], runId: string) => turns.findIndex((t) => t.id === runId || t.run?.id === runId);

/** Pure reducer for one streamed ChatEvent over the thread's turns. */
export function applyChatEvent(turns: TurnDTO[], e: ChatEvent): TurnDTO[] {
  switch (e.k) {
    case "run": {
      const i = turns.findIndex((t) => t.id === e.run.id || t.id === PENDING_TURN);
      if (i === -1) return [...turns, { id: e.run.id, prompt: e.run.prompt, at: e.run.startedAt ?? new Date().toISOString(), run: e.run, steps: [], approvals: [] }];
      return turns.map((t, j) => (j === i ? { ...t, id: e.run.id, run: e.run } : t));
    }
    case "step": {
      const i = turnOf(turns, e.step.runId);
      // child (delegate) steps carry the child's runId: attach them to the newest turn
      const k = i === -1 ? turns.length - 1 : i;
      if (k < 0) return turns;
      return turns.map((t, j) => (j === k ? { ...t, steps: upsert(t.steps, e.step).sort((a, b) => a.seq - b.seq) } : t));
    }
    case "delta": {
      const i = turnOf(turns, e.runId);
      if (i === -1) return turns;
      return turns.map((t, j) => (j === i && t.run ? { ...t, run: { ...t.run, answer: (t.run.answer ?? "") + e.text } } : t));
    }
    case "approval": {
      const i = turnOf(turns, e.approval.runId);
      if (i === -1) return turns;
      return turns.map((t, j) => (j === i ? { ...t, approvals: upsert(t.approvals, e.approval) } : t));
    }
    case "done": {
      const i = turnOf(turns, e.run.id);
      if (i === -1) return turns;
      return turns.map((t, j) => (j === i ? { ...t, run: e.run } : t));
    }
  }
}

/** Pure splitter: feed decoded text, get complete JSON lines back plus the unfinished remainder. */
export function splitNdjson(buffer: string, chunk: string): { events: ChatEvent[]; rest: string } {
  const parts = (buffer + chunk).split("\n");
  const rest = parts.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const line of parts) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ChatEvent);
    } catch {
      // ignore invalid lines
    }
  }
  return { events, rest };
}

export async function* readNdjson(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<ChatEvent> {
  const dec = new TextDecoder();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    const r = splitNdjson(rest, done ? dec.decode() + "\n" : dec.decode(value, { stream: true }));
    rest = r.rest;
    yield* r.events;
    if (done) return;
  }
}
