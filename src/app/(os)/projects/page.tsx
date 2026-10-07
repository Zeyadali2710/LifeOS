import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Projects · LifeOS" };

export default function ProjectsPage() {
  return (
    <DomainPage
      title="Projects"
      lead="Tasks, milestones and repositories together."
      icon="deployed_code"
      emptyTitle="No projects yet."
      emptyBody="Projects bring tasks, milestones and repositories together. They aren't built yet."
    />
  );
}
