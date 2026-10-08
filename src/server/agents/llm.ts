import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { LlmClient } from "./types";

export function anthropicClient(apiKey: string | undefined = env().ANTHROPIC_API_KEY): LlmClient | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return {
    async stream(p, onText, signal) {
      const stream = client.messages.stream(
        {
          model: p.model,
          max_tokens: p.maxTokens,
          system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
          tools: p.tools,
          messages: p.messages,
        },
        { signal },
      );
      stream.on("text", onText);
      const m = await stream.finalMessage();
      return {
        content: m.content,
        stopReason: m.stop_reason,
        usage: {
          input: m.usage.input_tokens ?? 0,
          output: m.usage.output_tokens ?? 0,
          cacheWrite: m.usage.cache_creation_input_tokens ?? 0,
          cacheRead: m.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

let llm: LlmClient | null | undefined;
/** Lazy module-level client; route tests vi.mock this module. */
export function getLlm(): LlmClient | null {
  return llm === undefined ? (llm = anthropicClient()) : llm;
}
