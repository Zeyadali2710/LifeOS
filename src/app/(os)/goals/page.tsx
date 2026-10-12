import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Goals · LifeOS" };

export default function GoalsPage() {
  return (
    <DomainPage
      eyebrowClass="text-green"
      title="Goals"
      lead="From vision to tasks."
      icon="flag"
      emptyTitle="No goals yet."
      emptyBody="Vision, goals and objectives are tracked here once Goals is built."
    />
  );
}
