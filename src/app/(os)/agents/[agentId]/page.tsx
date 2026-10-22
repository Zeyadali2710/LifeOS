import { redirect } from "next/navigation";

// The agent detail lives in the Agents inspector now; keep old links working.
export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  redirect(`/agents?id=${encodeURIComponent((await params).agentId)}`);
}
