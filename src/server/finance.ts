import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, ilike, isNull, lt, sql } from "drizzle-orm";
import { classify, DEFAULT_FINANCE_CATEGORIES, DEFAULT_FINANCE_RULES, effectiveBudgets, financeOverview, normalise, summariseFinance, type FinanceCategory, type FinanceKind, type FinanceRange, type ParsedTransaction } from "@/lib/finance";
import { parseFinanceCsv } from "@/lib/finance-csv";
import type { DB } from "./db/client";
import { auditLog, financeBudgets, financeCategories, financeImports, financeRules, financeTransactions } from "./db/schema";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export type PreviewRow = ParsedTransaction & { fingerprint: string; category: string | null; source: "csv" | "rule" | "unclassified"; reason: string; status: "new" | "duplicate" | "possible" | "conflict" };
type Stored = typeof financeTransactions.$inferSelect;

export async function ensureFinance(h: DB) {
  const [exists] = await h.select({ name: financeCategories.name }).from(financeCategories).limit(1);
  if (exists) return;
  await h.insert(financeCategories).values(DEFAULT_FINANCE_CATEGORIES).onConflictDoNothing();
  await h.insert(financeRules).values(DEFAULT_FINANCE_RULES).onConflictDoNothing();
}

function sameCandidate(a: ParsedTransaction, b: Stored) {
  if (a.externalId || b.externalId) return !!a.externalId && a.externalId === b.externalId;
  return a.amount === b.amount && normalise(a.description) === normalise(b.description) && a.balance === b.balance &&
    (a.date === b.date || ((a.precision === "month" || b.precision === "month") && a.date.slice(0, 7) === b.date.slice(0, 7)));
}

function canonicalCategory(name: string, names: string[]) {
  return names.find((n) => normalise(n) === normalise(name) || (normalise(n) === "restaraunts" && normalise(name) === "restaurants")) ?? name.trim();
}

export async function previewFinance(h: DB, text: string, account: string) {
  await ensureFinance(h);
  const parsed = parseFinanceCsv(text);
  const categories = await h.select().from(financeCategories);
  const names = categories.map((c) => c.name);
  if (parsed.kind === "rules") {
    const rules = parsed.rules.map((r) => ({ keyword: normalise(r.keyword), category: canonicalCategory(r.category, names) }));
    const seen = new Map<string, string>();
    for (const rule of rules) {
      if (seen.has(rule.keyword) && seen.get(rule.keyword) !== rule.category) throw new Error("The CSV assigns different categories to the same keyword. Resolve these conflicts first.");
      seen.set(rule.keyword, rule.category);
    }
    return { kind: "rules" as const, rules };
  }
  const [existing, rules, [imported]] = await Promise.all([
    h.select().from(financeTransactions).where(eq(financeTransactions.account, account)),
    h.select().from(financeRules),
    h.select({ id: financeImports.id }).from(financeImports).where(and(eq(financeImports.account, account), eq(financeImports.fileHash, hash(text)))),
  ]);
  const known = new Set([...names, ...parsed.rows.flatMap((r) => r.category ? [canonicalCategory(r.category, names)] : [])]);
  const occurrences = new Map<string, number>(), strongSeen = new Map<string, ParsedTransaction>();
  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const strong = !!row.externalId || row.balance !== null;
    const base = JSON.stringify(row.externalId ? ["id", row.externalId] : [row.date, row.amount, normalise(row.description), row.balance]);
    const occurrence = occurrences.get(base) ?? 0; occurrences.set(base, occurrence + 1);
    const fingerprint = hash(strong ? base : `${base}:${occurrence}`);
    const prev = existing.find((r) => sameCandidate(row, r));
    const inFile = strongSeen.get(fingerprint);
    let status: PreviewRow["status"] = imported || (strong && inFile) ? "duplicate" : prev ? strong ? "duplicate" : "possible" : "new";
    if (row.externalId && ((prev && (prev.amount !== row.amount || prev.date !== row.date || normalise(prev.description) !== normalise(row.description))) ||
        (inFile && (inFile.amount !== row.amount || inFile.date !== row.date || normalise(inFile.description) !== normalise(row.description))))) status = "conflict";
    if (strong) strongSeen.set(fingerprint, row);
    const category = row.category ? canonicalCategory(row.category, names) : null;
    const classification = classify(row.description, rules, known, category);
    return { ...row, ...classification, fingerprint, status };
  });
  return { kind: "transactions" as const, rows };
}
export type FinancePreview = Awaited<ReturnType<typeof previewFinance>>;

async function categoryIfMissing(h: DB, name: string, kind: FinanceKind = "expense") {
  await h.insert(financeCategories).values({ name, group: kind === "income" ? "Income" : "Misc", kind }).onConflictDoNothing();
}

export async function applyFinanceRules(h: DB) {
  const [rules, categories, rows] = await Promise.all([h.select().from(financeRules), h.select().from(financeCategories), h.select().from(financeTransactions).where(isNull(financeTransactions.category))]);
  let updated = 0;
  const known = new Set(categories.map((c) => c.name));
  for (const row of rows) {
    const result = classify(row.description, rules, known);
    if (result.category) {
      const won = await h.update(financeTransactions).set({ category: result.category, categorySource: "rule", updatedAt: new Date() })
        .where(and(eq(financeTransactions.id, row.id), isNull(financeTransactions.category))).returning({ id: financeTransactions.id });
      updated += won.length;
    }
  }
  return updated;
}

export async function importFinance(h: DB, text: string, account: string, fileName: string, keepPossible: boolean) {
  return h.transaction(async (tx) => {
    const t = tx as unknown as DB;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lifeos.finance:${account}`}))`);
    const preview = await previewFinance(t, text, account);
    if (preview.kind === "rules") {
      for (const rule of preview.rules) {
        await categoryIfMissing(t, rule.category);
        await tx.insert(financeRules).values(rule).onConflictDoUpdate({ target: financeRules.keyword, set: { category: rule.category, updatedAt: new Date() } });
      }
      await tx.insert(auditLog).values({ actor: "owner", action: "finance.rules.import", metadata: { rules: preview.rules.length } });
      return { kind: "rules" as const, imported: preview.rules.length, updated: await applyFinanceRules(t) };
    }
    if (preview.rows.some((r) => r.status === "conflict")) throw new Error("A transaction ID has conflicting details. Check the account and CSV before importing.");
    const selected = preview.rows.filter((r) => r.status === "new" || (keepPossible && r.status === "possible"));
    const [batch] = await tx.insert(financeImports).values({ account, fileName, fileHash: hash(text), imported: selected.length, skipped: preview.rows.length - selected.length })
      .onConflictDoNothing().returning();
    if (!batch) return { kind: "transactions" as const, imported: 0, skipped: preview.rows.length, unclassified: 0 };
    for (const row of selected) {
      if (row.category) await categoryIfMissing(t, row.category, row.amount < 0 ? "expense" : "income");
      await tx.insert(financeTransactions).values({ importId: batch.id, account, date: row.date, precision: row.precision, amount: row.amount,
        description: row.description, balance: row.balance, externalId: row.externalId, category: row.category, categorySource: row.source,
        fingerprint: row.status === "possible" ? hash(`${row.fingerprint}:${randomUUID()}`) : row.fingerprint });
    }
    await tx.insert(auditLog).values({ actor: "owner", action: "finance.import", target: batch.id, metadata: { imported: selected.length, skipped: preview.rows.length - selected.length } });
    return { kind: "transactions" as const, imported: selected.length, skipped: preview.rows.length - selected.length, unclassified: selected.filter((r) => !r.category).length };
  });
}

export async function loadFinance(h: DB, opts: { month: string; account: string; category: string; search: string; page: number; range?: FinanceRange }) {
  await ensureFinance(h);
  const account = opts.account ? eq(financeTransactions.account, opts.account) : undefined;
  const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const filtered = and(account, gte(financeTransactions.date, `${opts.month}-01`), lt(financeTransactions.date, nextMonth(opts.month)),
    opts.category === "review" ? isNull(financeTransactions.category) : opts.category ? eq(financeTransactions.category, opts.category) : undefined,
    opts.search ? ilike(financeTransactions.description, `%${escapeLike(opts.search)}%`) : undefined);
  const [categoryRows, rules, accounts, transactions, [count], records, budgets, imports, budgetRecords] = await Promise.all([
    h.select().from(financeCategories).orderBy(financeCategories.group, financeCategories.name),
    h.select().from(financeRules).orderBy(financeRules.keyword),
    h.selectDistinct({ account: financeImports.account }).from(financeImports).orderBy(financeImports.account),
    h.select().from(financeTransactions).where(filtered).orderBy(desc(financeTransactions.date), desc(financeTransactions.createdAt), financeTransactions.id).limit(50).offset(opts.page * 50),
    h.select({ count: sql<number>`count(*)::int` }).from(financeTransactions).where(filtered),
    h.select({ date: financeTransactions.date, amount: financeTransactions.amount, category: financeTransactions.category }).from(financeTransactions)
      .where(account),
    h.select().from(financeBudgets).where(sql`${financeBudgets.month} <= ${opts.month}`),
    h.select().from(financeImports).where(opts.account ? eq(financeImports.account, opts.account) : undefined).orderBy(desc(financeImports.createdAt)).limit(8),
    h.select({ date: financeTransactions.date, amount: financeTransactions.amount, category: financeTransactions.category }).from(financeTransactions)
      .where(and(gte(financeTransactions.date, `${opts.month}-01`), lt(financeTransactions.date, nextMonth(opts.month)))),
  ]);
  const categories = categoryRows.map((c): FinanceCategory => ({ name: c.name, group: c.group, kind: c.kind as FinanceKind }));
  const summary = financeOverview(records, categories, opts.month, opts.range);
  const budgetSummary = summariseFinance(budgetRecords, categories, opts.month);
  const effective = effectiveBudgets(budgets, opts.month);
  return { categories, rules: rules.map(({ keyword, category }) => ({ keyword, category })), accounts: accounts.map((a) => a.account),
    transactions: transactions.map((t) => ({ id: t.id, date: t.date, precision: t.precision, description: t.description, amount: t.amount, category: t.category, source: t.categorySource, account: t.account })),
    count: count?.count ?? 0, summary, budgetHasData: budgetSummary.count > 0, budgetUnclassified: budgetSummary.unclassified,
    budgets: categories.filter((c) => c.kind === "expense").map((c) => ({ category: c.name, group: c.group, limit: effective.get(c.name)?.cents ?? null, from: effective.get(c.name)?.month ?? null, actual: budgetSummary.categories.find((s) => s.name === c.name)?.amount ?? 0 })),
    imports: imports.map((i) => ({ id: i.id, account: i.account, fileName: i.fileName, imported: i.imported, skipped: i.skipped, at: i.createdAt.toISOString() })), ...opts };
}

export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${m === 12 ? y! + 1 : y}-${String(m === 12 ? 1 : m! + 1).padStart(2, "0")}-01`;
}
