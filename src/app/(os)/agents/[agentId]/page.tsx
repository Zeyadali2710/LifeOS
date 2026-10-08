import { notFound } from "next/navigation";
import { AgentDetail } from "@/agents/agent-detail";
import { agentDetail } from "@/server/agents/queries";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Agent · LifeOS" };

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  await requireOwner();
  const { agentId } = await params;
  const d = await agentDetail(db(), agentId);
  if (!d) notFound();
  // tools and systemPrompt stay on the server; the client gets the display fields only
  const { tools: _t, systemPrompt: _s, ...agent } = d.agent;
  void _t;
  void _s;
  return <AgentDetail {...d} agent={agent} />;
}
