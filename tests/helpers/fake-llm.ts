import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { apiName, type LlmClient, type LlmUsage } from "@/server/agents/types";

export type Turn = {
  text?: string;
  toolUses?: { name: string; input: unknown }[];
  usage?: Partial<LlmUsage>;
  stopReason?: string;
  throw?: Error;
};

let n = 0;

type Step = Turn | ((params: Parameters<LlmClient["stream"]>[0]) => Turn);

export function scriptedLlm(turns: Step[]): LlmClient & { calls: Parameters<LlmClient["stream"]>[0][] } {
  const queue = [...turns];
  const calls: Parameters<LlmClient["stream"]>[0][] = [];
  return {
    calls,
    async stream(params, onText) {
      calls.push({ ...params, messages: structuredClone(params.messages) }); // snapshot: the loop mutates its array
      const step = queue.shift();
      if (!step) throw new Error("script exhausted");
      const t = typeof step === "function" ? step(params) : step;
      if (t.throw) throw t.throw;
      for (const w of (t.text ?? "").split(/(?<=\s)/).filter(Boolean)) onText(w);
      const content = [
        ...(t.text ? [{ type: "text", text: t.text, citations: null }] : []),
        ...(t.toolUses ?? []).map((u) => ({ type: "tool_use", id: `toolu_${++n}`, name: apiName(u.name), input: u.input })),
      ] as ContentBlock[];
      return {
        content,
        stopReason: t.stopReason ?? (t.toolUses?.length ? "tool_use" : "end_turn"),
        usage: { input: 100, output: 20, cacheWrite: 0, cacheRead: 0, ...t.usage },
      };
    },
  };
}
