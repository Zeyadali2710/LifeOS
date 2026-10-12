import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ChatEvent, ToolTier } from "@/lib/agent-types";
import type { DB } from "../db/client";

export type ToolErrorCode = "not_allowed" | "paused" | "invalid_input" | "not_found" | "unavailable" | "cancelled";

export class ToolError extends Error {
  constructor(
    public code: ToolErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ToolError";
  }
}

export type LlmUsage = { input: number; output: number; cacheWrite: number; cacheRead: number; /** provider-reported spend; only OpenRouter sets it */ providerCostUsd?: number };
export type LlmTurn = { content: Anthropic.ContentBlock[]; stopReason: string | null; usage: LlmUsage };

export type AnthropicTool = { name: string; description: string; input_schema: Anthropic.Tool.InputSchema };

export interface LlmClient {
  stream(
    params: { model: string; system: string; messages: Anthropic.MessageParam[]; tools: AnthropicTool[]; maxTokens: number },
    onText: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmTurn>;
}

export type ToolContext = {
  handle: DB;
  runId: string;
  agentId: string;
  toolUseId: string;
  now: () => Date;
  fetch?: typeof fetch;
  approvalId?: string;
  adopt?: boolean;
  onEvent?: (e: ChatEvent) => void;
  llm?: LlmClient;
};

export type Tool<I = unknown, O = unknown> = {
  name: string; // dotted, e.g. "github.list_pull_requests"
  label: string; // trace action text
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  tier: ToolTier;
  sideEffect: boolean;
  /** Output is private owner data; taints the run so free models never see it (D-09). */
  private?: boolean;
  /** Reason the tool is unavailable, or null when usable. */
  available?(ctx: ToolContext): Promise<string | null>;
  /** Re-resolve entity ids against the DB; throws ToolError "not_found". */
  resolve?(input: I, ctx: ToolContext): Promise<I>;
  toApproval?(input: I): { payload: unknown; reason: string | null };
  handler(input: I, ctx: ToolContext): Promise<O>;
};

export const apiName = (name: string) => name.replaceAll(".", "_");

export function toAnthropicTool(tool: Pick<Tool, "name" | "description" | "input">): AnthropicTool {
  const schema = { ...(z.toJSONSchema(tool.input, { io: "input" }) as Record<string, unknown>) };
  delete schema.$schema;
  return { name: apiName(tool.name), description: tool.description, input_schema: schema as Anthropic.Tool.InputSchema };
}
