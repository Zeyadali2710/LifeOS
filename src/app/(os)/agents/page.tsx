import { CommandCentre } from "@/agents/command-centre";
import { sydneyMonthBounds } from "@/server/agents/pricing";
import { agentsOverview, recentRuns } from "@/server/agents/queries";
import { counts } from "@/server/agents/runs";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Agents · LifeOS" };

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ limit?: string | string[] }> }) {
  await requireOwner();
  const sp = await searchParams;
  const n = Number(typeof sp.limit === "string" ? sp.limit : 20);
  const limit = Number.isInteger(n) && n >= 20 && n <= 100 ? n : 20;
  const now = new Date();
  const h = db();
  const [overview, runs, c] = await Promise.all([agentsOverview(h, now), recentRuns(h, { limit, now }), counts(h)]);
  return (
    <CommandCentre
      overview={overview}
      runs={runs.items}
      hasMore={runs.nextCursor !== null && limit < 100}
      approvalsWaiting={c.approvalsWaiting}
      monthLabel={sydneyMonthBounds(now).label}
    />
  );
}
