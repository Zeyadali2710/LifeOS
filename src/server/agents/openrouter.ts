import "server-only";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { AnthropicTool, LlmClient, LlmUsage } from "./types";

export const FREE_TIMEOUT_MS = 45_000;
const URL = "https://openrouter.ai/api/v1/chat/completions";
const DENY_BACKOFF_MS = 10 * 60_000;

export type FreeErrorCode = "no_key" | "http" | "timeout" | "network" | "invalid_tool_call" | "bad_finish" | "empty" | "bad_body";

export class FreeModelError extends Error {
  code: FreeErrorCode;
  transient: boolean;
  status?: number;
  retryAfterMs?: number;
  constructor(code: FreeErrorCode, transient: boolean, opts: { status?: number; retryAfterMs?: number; message?: string } = {}) {
    super(opts.message ?? code);
    this.name = "FreeModelError";
    this.code = code;
    this.transient = transient;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

type OrMessage = Record<string, unknown>;

function blockText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).join("");
  return "";
}

function toOrMessages(system: string, messages: Anthropic.MessageParam[]): OrMessage[] {
  const out: OrMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const calls = m.content.flatMap((b) =>
        b.type === "tool_use" ? [{ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
      );
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      let text = "";
      for (const b of m.content) {
        if (b.type === "tool_result") {
          out.push({ role: "tool", tool_call_id: b.tool_use_id, content: (b.is_error ? "Error: " : "") + blockText(b.content) });
        } else if (b.type === "text") text += b.text;
      }
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

const toOrTools = (tools: AnthropicTool[]) =>
  tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

const FINISH: Record<string, string> = { tool_calls: "tool_use", stop: "end_turn", length: "max_tokens" };

type OrResponse = {
  choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export function createOpenRouter(deps: { getKey: () => Promise<string | null>; fetch?: typeof fetch }): LlmClient {
  const doFetch = deps.fetch ?? fetch;
  // ponytail: per process, not shared across instances; persist if multiple workers matter
  let denyUnsupportedUntil = 0;

  async function post(key: string, body: Record<string, unknown>, signal: AbortSignal | undefined, callerSignal?: AbortSignal) {
    try {
      return await doFetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (callerSignal?.aborted) throw e;
      if (e instanceof DOMException && e.name === "TimeoutError") throw new FreeModelError("timeout", true);
      throw new FreeModelError("network", true);
    }
  }

  return {
    async stream(p, onText, signal) {
      const key = await deps.getKey();
      if (!key) throw new FreeModelError("no_key", false);
      const sig = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(FREE_TIMEOUT_MS)]);
      const base = {
        model: p.model,
        messages: toOrMessages(p.system, p.messages),
        ...(p.tools.length ? { tools: toOrTools(p.tools), tool_choice: "auto" } : {}),
        stream: false,
        max_completion_tokens: p.maxTokens,
      };
      const withDeny = (deny: boolean) => ({ ...base, provider: { require_parameters: true, ...(deny ? { data_collection: "deny" } : {}) } });

      let res = await post(key, withDeny(Date.now() >= denyUnsupportedUntil), sig, signal);
      if (res.status === 404 && Date.now() >= denyUnsupportedUntil) {
        denyUnsupportedUntil = Date.now() + DENY_BACKOFF_MS;
        res = await post(key, withDeny(false), sig, signal);
      }
      if (!res.ok) {
        let detail = "";
        try {
          const j = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
          detail = `${j.error?.code ?? ""} ${j.error?.message ?? ""}`.trim().slice(0, 200);
        } catch {}
        const ra = Number(res.headers.get("retry-after"));
        throw new FreeModelError("http", res.status === 408 || res.status === 429 || (res.status >= 500 && res.status <= 599), {
          status: res.status,
          retryAfterMs: ra > 0 ? Math.min(ra * 1000, 5000) : undefined,
          message: `openrouter ${res.status}${detail ? `: ${detail}` : ""}`,
        });
      }

      let data: OrResponse;
      try {
        data = (await res.json()) as OrResponse;
      } catch {
        throw new FreeModelError("bad_body", false);
      }
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new FreeModelError("bad_body", false);
      const stopReason = FINISH[choice.finish_reason ?? ""];
      if (!stopReason) throw new FreeModelError("bad_finish", false);

      const content: Anthropic.ContentBlock[] = [];
      const text = typeof msg.content === "string" ? msg.content : "";
      if (text) content.push({ type: "text", text, citations: null });
      for (const c of msg.tool_calls ?? []) {
        let input: unknown;
        try {
          input = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          throw new FreeModelError("invalid_tool_call", false);
        }
        if (!input || typeof input !== "object" || Array.isArray(input) || !c.function?.name) throw new FreeModelError("invalid_tool_call", false);
        content.push({ type: "tool_use", id: `call_or_${randomUUID().slice(0, 12)}`, name: c.function.name, input } as Anthropic.ToolUseBlock);
      }
      if (!content.length) throw new FreeModelError("empty", false);
      if (text) onText(text);

      const u = data.usage;
      const usage: LlmUsage = u
        ? { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0, cacheWrite: 0, cacheRead: 0 }
        : {
            input: Math.ceil(JSON.stringify(base.messages).length / 4),
            output: Math.ceil((text.length + JSON.stringify(msg.tool_calls ?? []).length) / 4),
            cacheWrite: 0,
            cacheRead: 0,
          };
      if (u?.cost && u.cost > 0) usage.providerCostUsd = u.cost;
      return { content, stopReason, usage };
    },
  };
}
