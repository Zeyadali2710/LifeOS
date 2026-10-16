import { z } from "zod";
import { FINANCE_KINDS, monthPattern, normalise } from "./finance";

const name = z.string().trim().min(1).max(80);
export const financeChangePlan = z.object({
  title: z.string().trim().min(1).max(120),
  categories: z.array(z.object({ name, group: name, kind: z.enum(FINANCE_KINDS) })).max(150).default([]),
  retireCategories: z.array(z.object({ from: name, to: name })).max(150).default([]).describe("Remove old categories by mapping each to a retained/new category; preserves transactions and merges carried budgets."),
  rules: z.array(z.object({ keyword: z.string().trim().min(2).max(500), category: name })).max(500).default([]),
  clearRules: z.boolean().default(false).describe("Replace all previous keyword rules with the proposed rules."),
  recategoriseAll: z.boolean().default(false).describe("Reapply the proposed rules to all existing transactions, including reviewed and CSV assignments."),
  fallbackIncome: name.optional().describe("Explicit income category for unmatched positive transactions when recategorising all."),
  fallbackExpense: name.optional().describe("Explicit expense category for unmatched negative transactions when recategorising all."),
  assignments: z.array(z.object({ id: z.uuid(), category: name })).max(500).default([]).describe("Specific transaction corrections; take priority over rules."),
  budgets: z.array(z.object({ category: name, month: z.string().regex(monthPattern).min(7).max(7).refine(v => v >= "2000-01" && v <= "2100-12"), cents: z.number().int().min(0).max(2_000_000_000).nullable() })).max(500).default([]).describe("Monthly limits in integer AUD cents; null removes that month's override. Never invent a limit the owner has not requested."),
}).superRefine((p, ctx) => {
  for (const [field, values] of [
    ["categories", p.categories.map(c => normalise(c.name))],
    ["retireCategories", p.retireCategories.map(c => normalise(c.from))],
    ["rules", p.rules.map(r => normalise(r.keyword))],
    ["assignments", p.assignments.map(r => r.id)],
    ["budgets", p.budgets.map(b => `${b.category}:${b.month}`)],
  ] as const) if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", path: [field], message: "Remove duplicate entries." });
  if (p.recategoriseAll && (!p.fallbackIncome || !p.fallbackExpense)) ctx.addIssue({ code: "custom", path: ["recategoriseAll"], message: "Choose explicit fallback income and expense categories." });
});

export const financeImpact = z.object({
  transactions: z.number().int().min(0), changed: z.number().int().min(0), uncategorised: z.number().int().min(0),
  fallback: z.number().int().min(0), rulesRemoved: z.number().int().min(0), budgetsMoved: z.number().int().min(0),
});
export const financeChangePayload = z.object({
  plan: financeChangePlan,
  before: z.string().regex(/^[a-f0-9]{64}$/),
  impact: financeImpact,
  corrections: z.array(z.object({ id: z.uuid(), date: z.string(), description: z.string(), from: z.string().nullable(), to: z.string() })).max(500).default([]),
});
export type FinanceChangePlan = z.infer<typeof financeChangePlan>;
export type FinanceChangePayload = z.infer<typeof financeChangePayload>;
