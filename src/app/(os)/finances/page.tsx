import { FINANCE_RANGES, monthPattern, type FinanceRange } from "@/lib/finance";
import { sydneyYmd } from "@/lib/project-rules";
import { loadFinancesView } from "@/server/finances-view";
import { db } from "@/server/db/client";
import { loadFinance } from "@/server/finance";
import { requireOwner } from "@/server/session";
import { FinanceView } from "@/features/finances/finance-view";

export const metadata = { title: "Finances · LifeOS" };
export const dynamic = "force-dynamic";

export default async function FinancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const q = await searchParams;
  const month = typeof q.month === "string" && monthPattern.test(q.month) && q.month >= "2000-01" && q.month <= "2100-12" ? q.month : sydneyYmd(new Date()).slice(0, 7);
  const range = typeof q.range === "string" && FINANCE_RANGES.includes(q.range as FinanceRange) ? q.range as FinanceRange : "month";
  const [data, overview] = await Promise.all([
    loadFinance(db(), { month, range, account: typeof q.account === "string" ? q.account.slice(0, 80) : "", category: typeof q.category === "string" ? q.category.slice(0, 80) : "",
      search: typeof q.search === "string" ? q.search.slice(0, 100) : "", page: typeof q.page === "string" && /^\d{1,5}$/.test(q.page) ? Math.min(10000, Number(q.page)) : 0 }),
    loadFinancesView(db(), typeof q.account === "string" ? q.account.slice(0, 80) : ""),
  ]);
  return <FinanceView data={data} tab={typeof q.tab === "string" ? q.tab : "overview"} proposals={overview.proposals} recent={overview.recent} />;
}
