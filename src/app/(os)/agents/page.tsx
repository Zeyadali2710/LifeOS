import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Agents · LifeOS" };

export default function AgentsPage() {
  return (
    <DomainPage
      title="Agents"
      lead="Your autonomous workforce."
      icon="memory"
      emptyTitle="No agents configured."
      emptyBody="Agent status, runs and cost appear here once agents are connected."
    />
  );
}
