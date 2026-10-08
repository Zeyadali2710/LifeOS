import { notFound } from "next/navigation";
import { z } from "zod";
import { RunDetail } from "@/agents/run-detail";
import { runDetail } from "@/server/agents/queries";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Run · LifeOS" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  await requireOwner();
  const id = z.uuid().safeParse((await params).runId);
  if (!id.success) notFound();
  const d = await runDetail(db(), id.data);
  if (!d) notFound();
  // keep the system prompt and tool list on the server
  const agent = d.agent ? { ...d.agent, tools: [], systemPrompt: "" } : null;
  return <RunDetail {...d} agent={agent} />;
}
