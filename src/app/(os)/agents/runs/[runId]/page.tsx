import { redirect } from "next/navigation";

// Run traces open in the Agents inspector now; keep old links working.
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  redirect(`/agents?view=runs&run=${encodeURIComponent((await params).runId)}`);
}
