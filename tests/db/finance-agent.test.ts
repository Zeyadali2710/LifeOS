import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkLocked } from "@/lib/approval-kinds";
import { financeChangePayload, financeChangePlan } from "@/lib/finance-payload";
import { decide, executeApproved, saveEdit } from "@/server/agents/approvals";
import { callTool } from "@/server/agents/gateway";
import { advance, createRun } from "@/server/agents/loop";
import { hardPrivateInScope } from "@/server/agents/policy";
import { getAgent, MODELS } from "@/server/agents/registry";
import { freeModel } from "@/server/agents/routing";
import { TOOLS } from "@/server/agents/tools";
import { agentRuns, agents, approvals, auditLog, connections, financeBudgets, financeCategories, financeImports, financeRules, permissions, settings, toolCalls } from "@/server/db/schema";
import { importFinance } from "@/server/finance";
import { applyFinanceChanges, financeSnapshot, financeVersion } from "@/server/finance-agent";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") }) }));
const t = setupTestDb(), h = () => t.handle(), noop = async () => {};
const plan = financeChangePlan.parse({
  title: "Organise all imported transactions",
  categories: [{ name: "Groceries", group: "Food", kind: "expense" }, { name: "Salary", group: "Income", kind: "income" }, { name: "Other income", group: "Income", kind: "income" }, { name: "Other spending", group: "Misc", kind: "expense" }],
  retireCategories: [{ from: "Old food", to: "Groceries" }, { from: "Old pay", to: "Salary" }, { from: "Old misc", to: "Groceries" }],
  rules: [{ keyword: "Example market", category: "Groceries" }, { keyword: "Example salary", category: "Salary" }],
  clearRules: true, recategoriseAll: true, fallbackIncome: "Other income", fallbackExpense: "Other spending",
});
async function run(agentId = "finance", extra = {}) {
  const r = await createRun(h(), { agentId, prompt: "Organise finances", ...extra });
  if (!r.ok) throw new Error(r.code);
  return r.runId;
}
const call = async (name: string, input: unknown, runId?: string, agentId = "finance") => callTool({ handle: h(), agentId, runId: runId ?? await run(agentId), tools: TOOLS }, name, input, `tu_${Math.random()}`);
async function propose(p: unknown = plan) {
  const runId = await run();
  await call("finance.list_merchants", { limit: 200 }, runId);
  const r = await call("finance.update", { plan: p }, runId);
  expect(r.status).toBe("waiting_approval");
  return (r as { approvalId: string }).approvalId;
}
const row = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!;
const approve = async (id: string) => { expect(await decide(h(), id, "approve", { enqueue: noop })).toMatchObject({ ok: true }); return executeApproved(h(), id); };

beforeEach(async () => {
  for (const table of [agentRuns, agents, settings, connections, auditLog, financeImports, financeBudgets, financeRules, financeCategories]) await h().delete(table);
  await h().insert(financeCategories).values([{ name: "Old food", group: "Old", kind: "expense" }, { name: "Old pay", group: "Old", kind: "income" }, { name: "Old misc", group: "Old", kind: "expense" }]);
  await h().insert(financeRules).values({ keyword: "old rule", category: "Old misc" });
  await importFinance(h(), 'Date,Amount,Description,Balance,Category\n01/02/2026,1000,Example salary,1000,Old pay\n02/02/2026,-10,Example market,990,Old food\n03/02/2026,2,Example market,992,Old food\n04/02/2026,-5,Unknown transaction,987,Old misc', "example", "test.csv", false);
  await h().insert(financeBudgets).values([{ category: "Old food", month: "2026-01", cents: 10000 }, { category: "Old misc", month: "2026-02", cents: 2000 }, { category: "Old food", month: "2026-03", cents: 15000 }]);
});

describe("Finance agent and approvals", () => {
  it("is live, delegates from orchestrator, and keeps every write at HIGH_RISK", async () => {
    expect(getAgent("finance")).toMatchObject({ live: true, requiresTools: true, defaultModel: MODELS.sonnet });
    expect(getAgent("finance")?.routable).not.toBe(true);
    expect(getAgent("orchestrator")?.systemPrompt).toContain("finance agent");
    expect(TOOLS.delegate!.input.safeParse({ agentId: "finance", task: "List budgets" }).success).toBe(true);
    expect(TOOLS["finance.update"]).toMatchObject({ tier: "HIGH_RISK", sideEffect: true, private: true });
    expect(await call("finance.overview", {}, undefined, "organization")).toMatchObject({ status: "error" });
    await h().insert(permissions).values({ agentId: "finance", tool: "finance.update", tier: "READ" });
    const id = await propose();
    expect((await h().select().from(toolCalls).where(eq(toolCalls.id, (await row(id)).toolCallId)))[0]?.tier).toBe("HIGH_RISK");
  });
  it("reads all merchant pages without leaking balances and preserves keyword text", async () => {
    const a = await call("finance.list_merchants", { limit: 1 });
    const b = await call("finance.list_merchants", { limit: 2, offset: 1 });
    expect(a).toMatchObject({ status: "ok", output: { total: 3, totalTransactions: 4, nextOffset: 1 } });
    expect(b).toMatchObject({ status: "ok", output: { nextOffset: null } });
    const o = await call("finance.overview", {});
    expect(JSON.stringify(o)).toContain('"match":"old rule"');
    expect(JSON.stringify(o)).not.toContain('"balance"');
    expect(await call("finance.list_transactions", { search: "market" })).toMatchObject({ output: { total: 2 } });
  });
  it("requires full current merchant coverage before allowing a reorganisation", async () => {
    const id = await run();
    expect(await call("finance.update", { plan }, id)).toMatchObject({ status: "error" });
    await call("finance.list_merchants", { limit: 1 }, id);
    expect(await call("finance.update", { plan }, id)).toMatchObject({ status: "error" });
    await call("finance.list_merchants", { limit: 2, offset: 1 }, id);
    expect(await call("finance.update", { plan }, id)).toMatchObject({ status: "waiting_approval" });
  });
  it("makes one proposal without changing finance data, then atomically replaces categories and preserves transactions/budgets", async () => {
    const before = await financeSnapshot(h()), version = financeVersion(before);
    const id = await propose();
    expect(financeVersion(await financeSnapshot(h()))).toBe(version);
    expect((await h().select().from(toolCalls).where(eq(toolCalls.tool, "finance.update")))[0]?.tier).toBe("HIGH_RISK");
    expect(financeChangePayload.parse((await row(id)).originalPayload).impact).toMatchObject({ transactions: 4, changed: 4, fallback: 1, uncategorised: 0, budgetsMoved: 3 });
    expect(await approve(id)).toMatchObject({ status: "executed", result: { changed: 4, fallback: 1, uncategorised: 0 } });
    const after = await financeSnapshot(h());
    expect(after.categories.map(c => c.name).sort()).toEqual(["Groceries", "Other income", "Other spending", "Salary"]);
    expect(after.transactions.map(t => [t.id, t.amount, t.date, t.description])).toEqual(before.transactions.map(t => [t.id, t.amount, t.date, t.description]));
    expect(after.transactions.every(t => t.category)).toBe(true);
    expect(after.transactions.find(t => t.amount === 200)?.category).toBe("Groceries");
    expect(after.budgets.map(b => [b.category, b.month, b.cents])).toEqual([["Groceries", "2026-01", 10000], ["Groceries", "2026-02", 12000], ["Groceries", "2026-03", 17000]]);
    expect(await executeApproved(h(), id)).toMatchObject({ status: "executed" });
    const a = await row(id);
    const ctx = { handle: h(), approvalId: id, runId: a.runId, agentId: "finance", toolUseId: "retry", now: () => new Date() };
    const results = await Promise.all([applyFinanceChanges(a.editedPayload ?? a.originalPayload, ctx), applyFinanceChanges(a.editedPayload ?? a.originalPayload, ctx)]);
    expect(results.every(r => r.changed === 4)).toBe(true);
    expect(await h().select().from(auditLog).where(eq(auditLog.action, "finance.agent_update"))).toHaveLength(1);
  });
  it("rejects dangerous category references and invalid budgets before approval", async () => {
    const before = financeVersion(await financeSnapshot(h()));
    for (const p of [
      { ...plan, retireCategories: [{ from: "Old food", to: "Missing" }] },
      { ...plan, retireCategories: [{ from: "Old food", to: "Old misc" }, { from: "Old misc", to: "Groceries" }] },
      { ...plan, budgets: [{ category: "Salary", month: "2026-03", cents: 1 }] },
      { ...plan, budgets: [{ category: "Groceries", month: "2026-03", cents: -1 }] },
      { ...plan, budgets: [{ category: "Groceries", month: "2026-03", cents: 1.5 }] },
      { ...plan, rules: [{ keyword: "same", category: "Salary" }, { keyword: "SAME", category: "Groceries" }] },
    ]) expect(await call("finance.update", { plan: p })).toMatchObject({ status: "error" });
    expect(await h().select().from(approvals)).toHaveLength(0);
    expect(financeVersion(await financeSnapshot(h()))).toBe(before);
    await expect(applyFinanceChanges({}, { handle: h(), runId: "x", agentId: "finance", toolUseId: "x", now: () => new Date() })).rejects.toThrow(/approval/);
  });
  it("rejects without changes and refuses stale proposals both before and after approval", async () => {
    let before = financeVersion(await financeSnapshot(h()));
    const rejected = await propose();
    expect(await decide(h(), rejected, "reject")).toMatchObject({ ok: true });
    expect(financeVersion(await financeSnapshot(h()))).toBe(before);
    const stale = await propose();
    await h().update(financeCategories).set({ group: "Owner edit" }).where(eq(financeCategories.name, "Old food"));
    expect(await decide(h(), stale, "approve", { enqueue: noop })).toMatchObject({ ok: false, reason: "invalid" });
    const id = await propose();
    expect(await decide(h(), id, "approve", { enqueue: noop })).toMatchObject({ ok: true });
    await importFinance(h(), 'Date,Amount,Description\n05/02/2026,-1,New arrival', "example", "new.csv", false);
    before = financeVersion(await financeSnapshot(h()));
    expect(await executeApproved(h(), id)).toMatchObject({ status: "failed", ambiguous: false });
    expect(financeVersion(await financeSnapshot(h()))).toBe(before);
  });
  it("rolls back every finance change if an intermediate write fails", async () => {
    const before = financeVersion(await financeSnapshot(h()));
    const id = await propose();
    await t.pool().query("create function test_finance_write_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic write failure'; end $$");
    await t.pool().query("create trigger test_finance_write_failure before insert on finance_rules for each row execute function test_finance_write_failure()");
    try {
      expect(await approve(id)).toMatchObject({ status: "failed" });
      expect(financeVersion(await financeSnapshot(h()))).toBe(before);
      expect(await h().select().from(auditLog).where(eq(auditLog.action, "finance.agent_update"))).toHaveLength(0);
    } finally {
      await t.pool().query("drop trigger test_finance_write_failure on finance_rules");
      await t.pool().query("drop function test_finance_write_failure()");
    }
  });
  it("allows owner budget edits, recomputes impact, and locks the source snapshot", async () => {
    const id = await propose();
    const p = financeChangePayload.parse((await row(id)).originalPayload);
    expect(checkLocked("finance_update", p, { ...p, before: "0".repeat(64) })).toHaveProperty("before");
    const edited = { ...p, impact: { ...p.impact, fallback: 999 }, plan: { ...p.plan, budgets: [{ category: "Groceries", month: "2026-04", cents: 0 }] } };
    expect(await saveEdit(h(), id, edited)).toMatchObject({ ok: true });
    expect((await row(id)).editedPayload).toMatchObject({ impact: { fallback: 1 } });
    expect(await approve(id)).toMatchObject({ status: "executed" });
    expect(await h().select().from(financeBudgets).where(and(eq(financeBudgets.category, "Groceries"), eq(financeBudgets.month, "2026-04")))).toMatchObject([{ cents: 0 }]);
  });
  it("does not recategorise unrelated transactions when only changing a budget", async () => {
    await h().insert(financeRules).values({ keyword: "unknown transaction", category: "Old food" });
    await t.pool().query("update finance_transactions set category = null where description = $1", ["Unknown transaction"]);
    const before = (await financeSnapshot(h())).transactions;
    const id = await propose(financeChangePlan.parse({ title: "Change a budget only", budgets: [{ category: "Old food", month: "2026-04", cents: 2000 }] }));
    expect((await row(id)).originalPayload).toMatchObject({ impact: { changed: 0 } });
    expect(await approve(id)).toMatchObject({ status: "executed" });
    expect((await financeSnapshot(h())).transactions).toEqual(before);
  });
  it("delegates, suspends for approval, applies changes and resumes child and orchestrator", async () => {
    const id = await run("orchestrator");
    const llm = scriptedLlm([
      { toolUses: [{ name: "delegate", input: { agentId: "finance", task: "Reorganise transactions", tier: "reasoning" } }] },
      { toolUses: [{ name: "finance.overview", input: {} }, { name: "finance.list_merchants", input: { limit: 200 } }] },
      { toolUses: [{ name: "finance.update", input: { plan } }] },
      { text: "Changes applied. Open /finances." },
      { text: "Your Finance agent reorganised the transactions. Open /finances." },
    ]);
    expect(await advance(id, { handle: h(), llm })).toBe("waiting_approval");
    const [a] = await h().select().from(approvals);
    expect(await approve(a!.id)).toMatchObject({ status: "executed" });
    expect(await advance(a!.runId, { handle: h(), llm })).toBe("completed");
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, id)))[0]?.status).toBe("completed");
    expect(llm.calls[0]?.tools[0]?.input_schema).toBeDefined();
    expect(llm.calls.filter(c => c.system.includes("Finance agent")).every(c => !c.model.endsWith(":free"))).toBe(true);
  });
  it("hard-blocks finance data from free siblings and retries even with private-data opt-in", async () => {
    await h().insert(connections).values({ id: "openrouter", ciphertext: "x", last4: "abcd", status: "connected" });
    await h().insert(settings).values({ key: "ai.free_private_ok", value: true });
    const parent = await run("orchestrator");
    const f = await run("finance", { parentRunId: parent, tier: "simple" });
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, f)))[0]?.model).toBe(MODELS.sonnet);
    const sibling = await run("projects", { parentRunId: parent, tier: "simple" });
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, sibling)))[0]?.model).toBe(freeModel());
    await call("finance.overview", {}, f);
    expect(await hardPrivateInScope(h(), sibling)).toBe(true);
    const llm = scriptedLlm([{ toolUses: [{ name: "projects.list", input: {} }] }, { text: "Done" }]);
    expect(await advance(sibling, { handle: h(), llm })).toBe("completed");
    expect(llm.calls.every(c => !c.model.endsWith(":free"))).toBe(true);
    expect(await createRun(h(), { agentId: "projects", prompt: "retry", retryOf: f, privacyAnchor: f, tier: "simple" })).toMatchObject({ ok: true });
    expect(await h().select().from(agentRuns).where(eq(agentRuns.retryOf, f))).toMatchObject([{ model: MODELS.sonnet }]);
  });
});
