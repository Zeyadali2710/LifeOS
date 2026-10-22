import { GoalsView } from "@/features/goals/goals-view";
import { db } from "@/server/db/client";
import { loadGoals } from "@/server/goals";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Goals · LifeOS" };
export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const archived = (await searchParams).archived === "1";
  return <GoalsView data={await loadGoals(db(), new Date(), { includeArchived: archived })} archived={archived} />;
}
