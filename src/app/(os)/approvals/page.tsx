import { z } from "zod";
import { ApprovalsView } from "@/approvals/approvals-view";
import { getApproval, listApprovals } from "@/server/agents/approvals";
import { db } from "@/server/db/client";
import { getConnections } from "@/server/github/connections";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Approvals · LifeOS" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  await requireOwner();
  const sp = await searchParams;
  const parsed = z.uuid().safeParse(typeof sp.id === "string" ? sp.id : undefined);
  const h = db();
  const [pending, resolved, conns] = await Promise.all([listApprovals(h, "pending"), listApprovals(h, "resolved"), getConnections(h)]);
  const selected = parsed.success ? await getApproval(h, parsed.data) : null;
  const w = conns.find((c) => c.id === "github_write");
  const write = { connected: w?.status === "connected", login: w?.login ?? null, last4: w?.last4 ?? null };
  const key = [...pending, ...resolved].map((a) => `${a.id}:${a.status}`).join(",");
  return <ApprovalsView key={key} initialPending={pending} initialResolved={resolved} initialSelected={selected} missingId={Boolean(sp.id) && !selected} write={write} />;
}
