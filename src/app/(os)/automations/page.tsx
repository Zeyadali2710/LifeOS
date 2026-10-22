import { AutomationsView } from "@/features/automations/automations-view";
import { loadAutomationsView } from "@/server/automations-view";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Automations · LifeOS" };
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  await requireOwner();
  return <AutomationsView data={await loadAutomationsView(db())} />;
}
