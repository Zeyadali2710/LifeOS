// Mail triage (D-25): classify, summarise, flag and extract actions with Haiku. Bodies are fetched live and never stored.
import { z } from "zod";
import { IMPORTANCE, MAIL_CATEGORIES } from "@/lib/outreach-types";
import { toAnthropicTool, type AnthropicTool } from "../agents/types";

const TriageItem = z.object({
  id: z.string(),
  category: z.enum(MAIL_CATEGORIES),
  importance: z.enum(IMPORTANCE),
  summary: z.string().max(300),
  action: z.string().max(120),
  items: z.array(z.object({ text: z.string().max(200), due: z.iso.date().nullable().optional() })).max(5),
  flag: z.boolean(),
});
export type TriageItem = z.infer<typeof TriageItem>;

// Over-long fields are rejected, not cut: a bad batch leaves its rows untriaged and is retried.
export const triageResult = z.object({ results: z.array(TriageItem).max(10) });

export const RECORD_TRIAGE_TOOL: AnthropicTool = {
  name: "record_triage",
  description: "Record the triage result for every message in the batch, keyed by the message id.",
  input_schema: toAnthropicTool({ name: "record_triage", description: "", input: triageResult }).input_schema,
};
