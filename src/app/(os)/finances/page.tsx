import { monthPattern } from "@/lib/finance";
import { sydneyYmd } from "@/lib/project-rules";
import { db } from "@/server/db/client";
import { loadFinance } from "@/server/finance";
import { requireOwner } from "@/server/session";
import { FinanceView } from "@/finances/finance-view";

export const metadata = { title: "Finances · LifeOS" };
export const dynamic = "force-dynamic";

export default async function FinancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const q = await searchParams;
  const month = typeof q.month === "string" && monthPattern.test(q.month) && q.month >= "2000-01" && q.month <= "2100-12" ? q.month : sydneyYmd(new Date()).slice(0, 7);
  const data = await loadFinance(db(), { month, account: typeof q.account === "string" ? q.account.slice(0, 80) : "", category: typeof q.category === "string" ? q.category.slice(0, 80) : "",
    search: typeof q.search === "string" ? q.search.slice(0, 100) : "", page: typeof q.page === "string" && /^\d{1,5}$/.test(q.page) ? Math.min(10000, Number(q.page)) : 0 });
  return <FinanceView data={data} tab={typeof q.tab === "string" ? q.tab : "overview"} />;
}
