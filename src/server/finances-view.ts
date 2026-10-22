import { and, desc, eq, gt } from "drizzle-orm";
import { financeChangePayload } from "@/lib/finance-payload";
import type { DB } from "./db/client";
import { approvals, financeTransactions } from "./db/schema";

/** Overview data is independent of the Transactions tab's month, search and pagination. */
export async function loadFinancesView(h: DB, account: string) {
  const [pending, recent] = await Promise.all([
    h.select({ id: approvals.id, original: approvals.originalPayload, edited: approvals.editedPayload })
      .from(approvals)
      .where(and(eq(approvals.tool, "finance.update"), eq(approvals.status, "pending"), gt(approvals.expiresAt, new Date())))
      .orderBy(desc(approvals.createdAt)),
    h.select({ id: financeTransactions.id, date: financeTransactions.date, precision: financeTransactions.precision,
      description: financeTransactions.description, amount: financeTransactions.amount, category: financeTransactions.category,
      source: financeTransactions.categorySource, account: financeTransactions.account })
      .from(financeTransactions)
      .where(account ? eq(financeTransactions.account, account) : undefined)
      .orderBy(desc(financeTransactions.date), desc(financeTransactions.createdAt), financeTransactions.id).limit(7),
  ]);
  const proposals = pending.flatMap(a => {
    const parsed = financeChangePayload.safeParse(a.edited ?? a.original);
    return parsed.success ? [{ id: a.id, title: parsed.data.plan.title, rules: parsed.data.plan.rules }] : [];
  });
  return { recent, proposals };
}
