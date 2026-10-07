import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Approvals · LifeOS" };

export default function ApprovalsPage() {
  return (
    <DomainPage
      title="Approvals"
      lead="Decisions agents are waiting on."
      icon="verified_user"
      emptyTitle="Nothing is waiting for approval."
      emptyBody="Anything an agent wants to send, publish or delete will wait here for your decision."
    />
  );
}
