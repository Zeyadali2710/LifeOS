"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FINANCE_KINDS, MAX_CSV_BYTES, money, monthPattern, normalise } from "@/lib/finance";
import { db, type DB } from "./db/client";
import { auditLog, financeBudgets, financeCategories, financeImports, financeRules, financeTransactions } from "./db/schema";
import { applyFinanceRules, ensureFinance, importFinance, previewFinance } from "./finance";
import { requireOwner } from "./session";

const name = z.string().trim().min(1).max(80);
const accountSchema = z.string().trim().min(1).max(80).transform(normalise);
async function csvInput(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || !file.size || file.size > MAX_CSV_BYTES) throw new Error("Choose a CSV file up to 750 KB.");
  const account = accountSchema.safeParse(form.get("account"));
  if (!account.success) throw new Error("Add an account label (up to 80 characters).");
  return { text: await file.text(), account: account.data, fileName: file.name.slice(0, 200), keepPossible: form.get("keepPossible") === "true" };
}
const invalid = { ok: false, error: "Check the entered values." } as const;

export async function previewFinanceAction(form: FormData) {
  await requireOwner();
  try { const p = await csvInput(form); return { ok: true, preview: await previewFinance(db(), p.text, p.account) } as const; }
  catch (error) { return { ok: false, error: error instanceof Error && !error.message.includes("query:") ? error.message.slice(0, 200) : "Could not read the CSV. Try again." } as const; }
}
export async function importFinanceAction(form: FormData) {
  await requireOwner();
  try {
    const p = await csvInput(form);
    const result = await importFinance(db(), p.text, p.account, p.fileName, p.keepPossible);
    revalidatePath("/finances"); return { ok: true, result } as const;
  } catch { return { ok: false, error: "Could not confirm the import. Check recent imports, then preview again before retrying." } as const; }
}
export async function categoriseFinanceAction(id: string, category: string, keyword?: string) {
  await requireOwner();
  const p = z.object({ id: z.uuid(), category: name, keyword: z.string().trim().min(2).max(500).optional() }).safeParse({ id, category, keyword });
  if (!p.success) return invalid;
  try {
    await db().transaction(async (tx) => {
      const [changed] = await tx.update(financeTransactions).set({ category: p.data.category, categorySource: "manual", updatedAt: new Date() }).where(eq(financeTransactions.id, p.data.id)).returning({ id: financeTransactions.id });
      if (!changed) throw new Error("Unknown transaction");
      if (p.data.keyword) {
        await tx.insert(financeRules).values({ keyword: normalise(p.data.keyword), category: p.data.category }).onConflictDoUpdate({ target: financeRules.keyword, set: { category: p.data.category, updatedAt: new Date() } });
        await applyFinanceRules(tx as unknown as DB);
      }
      await tx.insert(auditLog).values({ actor: "owner", action: "finance.categorise", target: p.data.id, metadata: { remembered: !!p.data.keyword } });
    });
    revalidatePath("/finances"); return { ok: true } as const;
  } catch { return { ok: false, error: "Could not save the category." } as const; }
}
export async function saveFinanceRuleAction(keyword: string, category: string) {
  await requireOwner();
  const p = z.object({ keyword: z.string().trim().min(2).max(500), category: name }).safeParse({ keyword, category });
  if (!p.success) return invalid;
  try {
    const updated = await db().transaction(async (tx) => {
      await tx.insert(financeRules).values({ keyword: normalise(p.data.keyword), category: p.data.category }).onConflictDoUpdate({ target: financeRules.keyword, set: { category: p.data.category, updatedAt: new Date() } });
      const count = await applyFinanceRules(tx as unknown as DB);
      await tx.insert(auditLog).values({ actor: "owner", action: "finance.rule.save", metadata: { categorised: count } });
      return count;
    }); revalidatePath("/finances"); return { ok: true, updated } as const;
  } catch { return { ok: false, error: "Could not save the rule." } as const; }
}
export async function deleteFinanceRuleAction(keyword: string) {
  await requireOwner();
  if (!z.string().min(2).max(500).safeParse(keyword).success) return invalid;
  try { await db().delete(financeRules).where(eq(financeRules.keyword, keyword)); revalidatePath("/finances"); return { ok: true } as const; }
  catch { return { ok: false, error: "Could not remove the rule." } as const; }
}
export async function saveFinanceCategoryAction(raw: unknown) {
  await requireOwner();
  const p = z.object({ name, group: name, kind: z.enum(FINANCE_KINDS) }).safeParse(raw);
  if (!p.success) return invalid;
  try {
    await ensureFinance(db());
    const saved = await db().transaction(async (tx) => {
      // Budgets only exist for expense categories; a hidden budget on another treatment would block agent proposals.
      // The category row lock is shared with budget saves, so neither can slip past the other's check.
      await tx.select({ name: financeCategories.name }).from(financeCategories).where(eq(financeCategories.name, p.data.name)).for("update");
      if (p.data.kind !== "expense") {
        const [budget] = await tx.select({ month: financeBudgets.month }).from(financeBudgets).where(eq(financeBudgets.category, p.data.name)).limit(1);
        if (budget) return false;
      }
      await tx.insert(financeCategories).values(p.data).onConflictDoUpdate({ target: financeCategories.name, set: { group: p.data.group, kind: p.data.kind, updatedAt: new Date() } });
      return true;
    });
    if (!saved) return { ok: false, error: "Clear this category's monthly budgets before changing it from an expense." } as const;
    revalidatePath("/finances"); return { ok: true } as const;
  }
  catch { return { ok: false, error: "Could not save the category." } as const; }
}
export async function saveFinanceBudgetAction(category: string, month: string, amount: string) {
  await requireOwner();
  if (!name.safeParse(category).success || !monthPattern.test(month) || month < "2000-01" || month > "2100-12") return invalid;
  try {
    if (!amount.trim()) await db().delete(financeBudgets).where(and(eq(financeBudgets.category, category), eq(financeBudgets.month, month)));
    else {
      const cents = money(amount); if (cents < 0) return invalid;
      const ok = await db().transaction(async (tx) => {
        const [cat] = await tx.select().from(financeCategories).where(eq(financeCategories.name, category)).for("update");
        if (cat?.kind !== "expense") return false;
        await tx.insert(financeBudgets).values({ category, month, cents }).onConflictDoUpdate({ target: [financeBudgets.category, financeBudgets.month], set: { cents, updatedAt: new Date() } });
        return true;
      });
      if (!ok) return invalid;
    }
    revalidatePath("/finances"); return { ok: true } as const;
  } catch { return { ok: false, error: "Enter a valid non-negative AUD budget." } as const; }
}
export async function removeFinanceImportAction(id: string) {
  await requireOwner();
  if (!z.uuid().safeParse(id).success) return invalid;
  try {
    await db().transaction(async (tx) => {
      const [batch] = await tx.select().from(financeImports).where(eq(financeImports.id, id));
      if (!batch) throw new Error("Unknown import");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lifeos.finance:${batch.account}`}))`);
      await tx.delete(financeImports).where(eq(financeImports.id, id));
      await tx.insert(auditLog).values({ actor: "owner", action: "finance.import.remove", target: id, metadata: {} });
    }); revalidatePath("/finances"); return { ok: true } as const;
  } catch { return { ok: false, error: "Could not remove this import." } as const; }
}
