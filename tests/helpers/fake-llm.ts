import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { apiName, type LlmClient, type LlmUsage } from "@/server/agents/types";

type Turn = {
  text?: string;
  toolUses?: { name: string; input: unknown }[];
  usage?: Partial<LlmUsage>;
  stopReason?: string;
};

let n = 0;

export function scriptedLlm(turns: Turn[]): LlmClient & { calls: Parameters<LlmClient["stream"]>[0][] } {
  const queue = [...turns];
  const calls: Parameters<LlmClient["stream"]>[0][] = [];
  return {
    calls,
    async stream(params, onText) {
      calls.push(params);
      const t = queue.shift();
      if (!t) throw new Error("script exhausted");
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
