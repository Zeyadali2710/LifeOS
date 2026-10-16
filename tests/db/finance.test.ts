import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { financeBudgets, financeCategories, financeImports, financeRules, financeTransactions } from "@/server/db/schema";
import { ensureFinance, importFinance, loadFinance, previewFinance } from "@/server/finance";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const allowed = vi.hoisted(() => ({ owner: true }));
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (!allowed.owner) throw new Error("Not owner"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
import { categoriseFinanceAction, deleteFinanceRuleAction, importFinanceAction, previewFinanceAction, removeFinanceImportAction, saveFinanceBudgetAction, saveFinanceCategoryAction, saveFinanceRuleAction } from "@/server/finance-actions";

const csv = 'Date,Amount,Description,Balance,Category\n01/02/2026,1000,Salary,1100,Work\n02/02/2026,-10,Test market,1090,Groceries';
beforeEach(async () => {
  allowed.owner = true;
  for (const table of [financeImports, financeBudgets, financeRules, financeCategories]) await t.handle().delete(table);
  await ensureFinance(t.handle());
});

describe("finance import and account isolation", () => {
  it("imports once, dedupes reordered/overlapping exports, keeps separate accounts and balances", async () => {
    const h = t.handle();
    expect(await importFinance(h, csv, "main", "bank.csv", false)).toMatchObject({ imported: 2 });
    expect(await importFinance(h, csv, "main", "renamed.csv", false)).toMatchObject({ imported: 0, skipped: 2 });
    const overlap = 'Date,Amount,Description,Balance\n02/02/2026,-10,Test market,1090\n02/02/2026,-10,Test market,1080';
    expect(await importFinance(h, overlap, "main", "overlap.csv", false)).toMatchObject({ imported: 1, skipped: 1 });
    expect(await importFinance(h, csv, "other", "bank.csv", false)).toMatchObject({ imported: 2 });
    expect(await h.select().from(financeTransactions)).toHaveLength(5);
    expect((await h.select().from(financeTransactions).where(eq(financeTransactions.amount, -1000))).find((r) => r.balance === 109000)?.category).toBe("Groceries");
  });
  it("serializes simultaneous imports so overlapping jobs cannot duplicate transactions", async () => {
    const results = await Promise.all([importFinance(t.handle(), csv, "main", "a.csv", false), importFinance(t.handle(), csv, "main", "b.csv", false)]);
    expect(results.reduce((n, r) => n + r.imported, 0)).toBe(2);
    expect(await t.handle().select().from(financeTransactions)).toHaveLength(2);
  });
  it("preserves legitimate identical payments without balances, and flags overlapping matches for review", async () => {
    const raw = 'Date,Amount,Description\n02/02/2026,-10,Test shop\n02/02/2026,-10,Test shop';
    expect(await importFinance(t.handle(), raw, "main", "a.csv", false)).toMatchObject({ imported: 2 });
    const preview = await previewFinance(t.handle(), raw + '\n03/02/2026,-5,Other shop', "main");
    expect(preview.kind).toBe("transactions");
    if (preview.kind !== "transactions") throw new Error("Wrong preview");
    expect(preview.rows.map((r) => r.status)).toEqual(["possible", "possible", "new"]);
    expect(await importFinance(t.handle(), raw + '\n03/02/2026,-5,Other shop', "main", "b.csv", false)).toMatchObject({ imported: 1, skipped: 2 });
  });
  it("matches month-only Excel history to exact bank dates using a stable balance", async () => {
    await importFinance(t.handle(), 'Month,Amount,Name,Balance,Category\n2026-02,-10,Test market,1090,Groceries', "main", "excel.csv", false);
    expect(await importFinance(t.handle(), 'Date,Amount,Description,Balance\n02/02/2026,-10,Test market,1090', "main", "bank.csv", false)).toMatchObject({ imported: 0, skipped: 1 });
  });
  it("rejects conflicting transaction IDs atomically", async () => {
    const raw = 'Date,Amount,Description,Transaction ID\n02/02/2026,-10,Store,one';
    await importFinance(t.handle(), raw, "main", "a.csv", false);
    await expect(importFinance(t.handle(), raw.replace('-10', '-20') + '\n03/02/2026,-5,Other,two', "main", "b.csv", false)).rejects.toThrow(/conflicting/);
    expect(await t.handle().select().from(financeTransactions)).toHaveLength(1);
    expect(await t.handle().select().from(financeImports)).toHaveLength(1);
  });
  it("imports keyword rules, categorises unknown rows, and preserves manual/CSV categories", async () => {
    await importFinance(t.handle(), 'Date,Amount,Description,Category\n01/02/2026,-10,Test cafe,\n02/02/2026,-5,Test cafe,Groceries', "main", "a.csv", false);
    expect(await importFinance(t.handle(), 'Keyword,Category\nTest cafe,Restaraunts', "main", "rules.csv", false)).toMatchObject({ kind: "rules", updated: 1 });
    const rows = await t.handle().select().from(financeTransactions);
    expect(rows.map((r) => r.category).sort()).toEqual(["Groceries", "Restaraunts"]);
    await expect(previewFinance(t.handle(), 'Keyword,Category\nTest cafe,Groceries\nTEST CAFE,Restaraunts', "main")).rejects.toThrow(/same keyword/);
  });
});

describe("finance budgets, edits and owner guard", () => {
  it("carries monthly budgets, includes all accounts, and never treats an empty month as complete data", async () => {
    await importFinance(t.handle(), csv, "main", "a.csv", false);
    await importFinance(t.handle(), csv, "other", "a.csv", false);
    expect(await saveFinanceBudgetAction("Groceries", "2026-01", "100")).toMatchObject({ ok: true });
    const data = await loadFinance(t.handle(), { month: "2026-02", account: "main", category: "", search: "", page: 0 });
    expect(data.summary.spending).toBe(1000);
    expect(data.budgets.find((r) => r.category === "Groceries")).toMatchObject({ actual: 2000, limit: 10000, from: "2026-01" });
    await saveFinanceBudgetAction("Groceries", "2026-02", "0");
    expect((await loadFinance(t.handle(), { month: "2026-03", account: "", category: "", search: "", page: 0 })).budgets.find((r) => r.category === "Groceries")?.limit).toBe(0);
    await saveFinanceBudgetAction("Groceries", "2026-02", "");
    const empty = await loadFinance(t.handle(), { month: "2026-03", account: "", category: "", search: "", page: 0 });
    expect(empty.budgetHasData).toBe(false);
    expect(empty.budgets.find((r) => r.category === "Groceries")?.limit).toBe(10000);
  });
  it("remembers a correction for other unreviewed transactions and scopes import removal", async () => {
    await importFinance(t.handle(), 'Date,Amount,Description\n01/02/2026,-10,Test merchant\n02/02/2026,-20,Test merchant', "main", "a.csv", false);
    await importFinance(t.handle(), csv, "other", "b.csv", false);
    const [row] = await t.handle().select().from(financeTransactions).where(eq(financeTransactions.account, "main"));
    expect(await categoriseFinanceAction(row!.id, "Groceries", "test merchant")).toMatchObject({ ok: true });
    expect((await t.handle().select().from(financeTransactions).where(eq(financeTransactions.account, "main"))).every((r) => r.category === "Groceries")).toBe(true);
    const [batch] = await t.handle().select().from(financeImports).where(eq(financeImports.account, "main"));
    expect(await removeFinanceImportAction(batch!.id)).toMatchObject({ ok: true });
    const remaining = await t.handle().select().from(financeTransactions);
    expect(remaining).toHaveLength(2); expect(remaining.every((r) => r.account === "other")).toBe(true);
  });
  it("checks the owner before every finance read/mutation action", async () => {
    allowed.owner = false;
    const form = new FormData();
    const calls = [() => previewFinanceAction(form), () => importFinanceAction(form), () => categoriseFinanceAction("bad", "Work"), () => saveFinanceRuleAction("test", "Work"), () => deleteFinanceRuleAction("test"), () => saveFinanceCategoryAction({}), () => saveFinanceBudgetAction("Groceries", "2026-02", "1"), () => removeFinanceImportAction("bad")];
    for (const call of calls) await expect(call()).rejects.toThrow("Not owner");
    expect(await t.handle().select().from(financeTransactions)).toHaveLength(0);
  });
});
