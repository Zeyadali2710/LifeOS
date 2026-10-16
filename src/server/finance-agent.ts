import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { classify, effectiveBudgets, normalise, type FinanceKind } from "@/lib/finance";
import { financeChangePayload, type FinanceChangePlan } from "@/lib/finance-payload";
import type { DB } from "./db/client";
import { auditLog, financeBudgets, financeCategories, financeRules, financeTransactions } from "./db/schema";
import { ToolError, type ToolContext } from "./agents/types";

export async function financeSnapshot(h: DB) {
  // Sequential queries also work on a single transaction client.
  const categories = await h.select({ name: financeCategories.name, group: financeCategories.group, kind: financeCategories.kind, updatedAt: financeCategories.updatedAt }).from(financeCategories).orderBy(financeCategories.name);
  const rules = await h.select({ keyword: financeRules.keyword, category: financeRules.category, updatedAt: financeRules.updatedAt }).from(financeRules).orderBy(financeRules.keyword);
  const budgets = await h.select({ category: financeBudgets.category, month: financeBudgets.month, cents: financeBudgets.cents, updatedAt: financeBudgets.updatedAt }).from(financeBudgets).orderBy(financeBudgets.category, financeBudgets.month);
  const transactions = await h.select({ id: financeTransactions.id, description: financeTransactions.description, amount: financeTransactions.amount, date: financeTransactions.date, account: financeTransactions.account, category: financeTransactions.category, categorySource: financeTransactions.categorySource, updatedAt: financeTransactions.updatedAt }).from(financeTransactions).orderBy(financeTransactions.id);
  return { categories, rules, budgets, transactions };
}
export type FinanceSnapshot = Awaited<ReturnType<typeof financeSnapshot>>;
export const financeVersion = (s: FinanceSnapshot) => createHash("sha256").update(JSON.stringify(s)).digest("hex");
const invalid = (message: string): never => { throw new ToolError("invalid_input", message); };

/** One simulation owns preview and execution so the approved effects cannot diverge. */
export function planFinanceChanges(s: FinanceSnapshot, p: FinanceChangePlan) {
  const cats = new Map(s.categories.map(c => [c.name, { name: c.name, group: c.group, kind: c.kind as FinanceKind }]));
  for (const c of p.categories) {
    if ([...cats.keys()].some(n => normalise(n) === normalise(c.name) && n !== c.name)) invalid("A category already exists with different capitalisation. Use its exact name.");
    cats.set(c.name, c);
  }
  const retired = new Map(p.retireCategories.map(c => [c.from, c.to]));
  for (const [from, to] of retired) {
    if (!s.categories.some(c => c.name === from) || !cats.has(to) || from === to || retired.has(to)) invalid("Each retired category must map directly to a retained/new category.");
    cats.delete(from);
  }
  const requireCategory = (name: string) => { if (!cats.has(name)) invalid("A referenced category does not exist in the proposed category set."); };
  const remap = (name: string) => retired.get(name) ?? name;
  const known = new Set(cats.keys());
  const rules = new Map<string, { keyword: string; category: string }>();
  if (!p.clearRules) for (const r of s.rules) rules.set(r.keyword, { keyword: r.keyword, category: remap(r.category) });
  for (const r of p.rules) { requireCategory(r.category); const keyword = normalise(r.keyword); rules.set(keyword, { keyword, category: r.category }); }
  if (p.recategoriseAll) {
    requireCategory(p.fallbackIncome!); requireCategory(p.fallbackExpense!);
    if (cats.get(p.fallbackIncome!)?.kind !== "income" || cats.get(p.fallbackExpense!)?.kind !== "expense") invalid("Fallback treatments must be income and expense respectively.");
  }
  for (const a of p.assignments) { requireCategory(a.category); if (!s.transactions.some(t => t.id === a.id)) invalid("A transaction no longer exists."); }
  const assignments = new Map(p.assignments.map(a => [a.id, a.category]));
  let fallback = 0;
  const updates: { id: string; category: string; categorySource: "manual" | "rule" }[] = [];
  const ruleList = [...rules.values()];
  let uncategorised = 0;
  for (const t of s.transactions) {
    let category = t.category ? remap(t.category) : null;
    let source = t.categorySource;
    if (p.recategoriseAll || (!category && p.rules.length > 0)) {
      const match = classify(t.description, ruleList, known);
      if (match.category) { category = match.category; source = "rule"; }
      else if (p.recategoriseAll) { category = t.amount < 0 ? p.fallbackExpense! : p.fallbackIncome!; source = "manual"; if (!assignments.has(t.id)) fallback++; }
    }
    if (assignments.has(t.id)) { category = assignments.get(t.id)!; source = "manual"; }
    if (!category) uncategorised++;
    else if (category !== t.category || source !== t.categorySource) updates.push({ id: t.id, category, categorySource: source === "rule" ? "rule" : "manual" });
  }
  // Merge effective carried limits at every boundary, rather than summing only rows in the same month.
  const budgets = new Map<string, { category: string; month: string; cents: number }>();
  const targets = new Set(p.retireCategories.map(c => c.to));
  for (const b of s.budgets) if (!retired.has(b.category) && !targets.has(b.category)) budgets.set(`${b.category}:${b.month}`, { category: b.category, month: b.month, cents: b.cents });
  for (const target of targets) {
    const old = s.budgets.filter(b => remap(b.category) === target);
    for (const month of [...new Set(old.map(b => b.month))].sort()) {
      const cents = [...effectiveBudgets(old, month).values()].reduce((n, b) => n + b.cents, 0);
      if (cents > 2_000_000_000) invalid("Merged budget exceeds the supported amount.");
      budgets.set(`${target}:${month}`, { category: target, month, cents });
    }
  }
  for (const b of p.budgets) {
    requireCategory(b.category);
    // Clearing (cents null) stays allowed for any treatment so leftover non-expense budgets can be removed.
    if (b.cents !== null && cats.get(b.category)?.kind !== "expense") invalid("Budgets require an expense category.");
    if (b.cents === null) budgets.delete(`${b.category}:${b.month}`); else budgets.set(`${b.category}:${b.month}`, { ...b, cents: b.cents });
  }
  for (const b of budgets.values()) if (cats.get(b.category)?.kind !== "expense") invalid("Existing budgets must be removed or mapped to an expense category before changing its treatment.");
  return { categories: [...cats.values()], rules: ruleList, budgets: [...budgets.values()], updates,
    impact: { transactions: s.transactions.length, changed: updates.length, uncategorised, fallback, rulesRemoved: p.clearRules ? s.rules.length : 0, budgetsMoved: s.budgets.filter(b => retired.has(b.category)).length } };
}

export async function prepareFinanceChanges(h: DB, plan: FinanceChangePlan) {
  return h.transaction(async tx => {
    const s = await financeSnapshot(tx as unknown as DB);
    const corrections = plan.assignments.map(a => {
      const t = s.transactions.find(t => t.id === a.id);
      if (!t) invalid("A transaction no longer exists.");
      return { id: a.id, date: t!.date, description: t!.description, from: t!.category, to: a.category };
    });
    return { plan, before: financeVersion(s), impact: planFinanceChanges(s, plan).impact, corrections };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function refreshFinanceProposal(h: DB, raw: unknown) {
  const p = financeChangePayload.parse(raw);
  const fresh = await prepareFinanceChanges(h, p.plan);
  if (fresh.before !== p.before) throw new ToolError("invalid_input", "Finance data changed since this proposal. Request a fresh proposal.");
  return fresh;
}

export async function applyFinanceChanges(raw: unknown, ctx: ToolContext) {
  if (!ctx.approvalId) throw new ToolError("not_allowed", "Finance changes require owner approval.");
  const p = financeChangePayload.parse(raw);
  return ctx.handle.transaction(async tx => {
    // Block concurrent imports, owner edits and other approvals until the snapshot check and all changes commit.
    await tx.execute(sql`lock table finance_categories, finance_rules, finance_transactions, finance_budgets in share row exclusive mode`);
    const [marker] = await tx.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, "finance.agent_update"), eq(auditLog.target, ctx.approvalId!)));
    if (marker) return (marker.metadata as { result: FinanceChangeResult }).result;
    const s = await financeSnapshot(tx as unknown as DB);
    if (financeVersion(s) !== p.before) throw new ToolError("invalid_input", "Finance data changed since this proposal. Request a fresh proposal before applying it.");
    const next = planFinanceChanges(s, p.plan);
    for (const c of next.categories) await tx.insert(financeCategories).values(c).onConflictDoUpdate({ target: financeCategories.name, set: { group: c.group, kind: c.kind, updatedAt: ctx.now() } });
    await tx.delete(financeRules);
    if (next.rules.length) await tx.insert(financeRules).values(next.rules);
    await tx.delete(financeBudgets);
    if (next.budgets.length) await tx.insert(financeBudgets).values(next.budgets);
    for (const c of next.updates) await tx.update(financeTransactions).set({ category: c.category, categorySource: c.categorySource, updatedAt: ctx.now() }).where(eq(financeTransactions.id, c.id));
    if (p.plan.retireCategories.length) await tx.delete(financeCategories).where(inArray(financeCategories.name, p.plan.retireCategories.map(c => c.from)));
    const result: FinanceChangeResult = { url: "/finances", ...next.impact };
    await tx.insert(auditLog).values({ actor: "agent:finance", action: "finance.agent_update", target: ctx.approvalId, metadata: { result } });
    return result;
  });
}
export type FinanceChangeResult = { url: string; transactions: number; changed: number; uncategorised: number; fallback: number; rulesRemoved: number; budgetsMoved: number };
