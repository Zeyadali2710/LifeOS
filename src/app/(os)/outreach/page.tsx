import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Outreach · LifeOS" };

export default function OutreachPage() {
  return (
    <DomainPage
      title="Outreach"
      lead="Events and email in one pipeline."
      icon="hub"
      emptyTitle="Outreach isn't set up yet."
      emptyBody="Sydney events and email intelligence appear here once sources are connected."
    />
  );
}
