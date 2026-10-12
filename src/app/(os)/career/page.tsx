import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Career · LifeOS" };

export default function CareerPage() {
  return (
    <DomainPage
      eyebrowClass="text-amber"
      title="Career"
      lead="Repositories, pull requests and activity."
      icon="terminal"
      emptyTitle="Career isn't set up yet."
      emptyBody="Repositories and commit activity appear here once GitHub is connected."
    />
  );
}
