import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client";
import { env } from "../env";
import { markConnectionError, openrouterKey } from "../github/connections";
import { createOpenRouter, FreeModelError } from "./openrouter";
import { isFree } from "./routing";
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

export function dispatchingClient(anthropic: LlmClient, free: LlmClient): LlmClient {
  return { stream: (p, onText, signal) => (isFree(p.model) ? free : anthropic).stream(p, onText, signal) };
}

let llm: LlmClient | null | undefined;
/** Lazy module-level client; route tests vi.mock this module. Null iff no Anthropic key. */
export function getLlm(): LlmClient | null {
  if (llm !== undefined) return llm;
  const a = anthropicClient();
  if (!a) return (llm = null);
  const or = createOpenRouter({ getKey: () => openrouterKey(db()) });
  const wrapped: LlmClient = {
    async stream(p, onText, signal) {
      try {
        return await or.stream(p, onText, signal);
      } catch (e) {
        if (e instanceof FreeModelError && (e.status === 401 || e.status === 402)) {
          const msg = e.status === 401 ? "OpenRouter rejected the key (401)" : "OpenRouter account has no credit (402)";
          await markConnectionError(db(), "openrouter", msg).catch(() => undefined);
        }
        throw e;
      }
    },
  };
  return (llm = dispatchingClient(a, wrapped));
}
