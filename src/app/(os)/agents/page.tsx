import { z } from "zod";
import { AgentsViewScreen, type AgentsView } from "@/features/agents/agents-view";
import { RouteState } from "@/features/shell/route-state";
import { getApproval, listApprovals } from "@/server/agents/approvals";
import { agentsOverview, recentRuns } from "@/server/agents/queries";
import { AGENTS } from "@/server/agents/registry";
import { agentInspector, agentTable, runTrace } from "@/server/agents/view";
import { db } from "@/server/db/client";
import { getConnections } from "@/server/github/connections";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Agents · LifeOS" };

const VIEWS = ["office", "approvals", "table", "runs"] as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const sp = await searchParams;
  const view: AgentsView = (VIEWS as readonly string[]).includes(one(sp.view) ?? "") ? (one(sp.view) as AgentsView) : "office";
  const h = db();
  const now = new Date();
  const approvalId = view === "approvals" ? z.uuid().safeParse(one(sp.id)) : null;
  const runId = z.uuid().safeParse(one(sp.run));
  const [overview, runs, table, pending, resolved, conns, selected, trace] = await Promise.all([
    agentsOverview(h, now),
    recentRuns(h, { limit: 100, now }),
    agentTable(h, now),
    listApprovals(h, "pending"),
    listApprovals(h, "resolved"),
    getConnections(h),
    approvalId?.success ? getApproval(h, approvalId.data) : null,
    runId.success ? runTrace(h, runId.data) : null,
  ]);
  if (!overview.agents.some((a) => a.live)) return <RouteState route="agents" kind="empty" action={{ label: "Open Settings", href: "/settings?section=ai" }} />;

  const wanted = view !== "approvals" ? one(sp.id) : undefined;
  const pendingAgent = pending[0]?.agentId;
  const initialSel = AGENTS.some((a) => a.id === wanted) ? wanted! : (trace?.run.agentId ?? pendingAgent ?? "orchestrator");
  const inspector = await agentInspector(h, initialSel, now);
  const w = conns.find((c) => c.id === "github_write");

  return (
    <AgentsViewScreen
      view={view}
      agents={overview.agents.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose, live: a.live, status: a.status, currentTask: a.currentTask, stats: a.stats ? { last: a.stats.last } : null }))}
      runs={runs.items}
      table={table}
      spend={{ mtdUsd: overview.spend.mtdUsd, capUsd: overview.spend.capUsd }}
      globalPaused={overview.globalPaused}
      initialSel={initialSel}
      initialInspector={inspector}
      initialTrace={trace}
      approvals={{ pending, resolved, selected, missingId: Boolean(approvalId && one(sp.id)) && !selected }}
      write={{ connected: w?.status === "connected", login: w?.login ?? null, last4: w?.last4 ?? null }}
    />
  );
}
