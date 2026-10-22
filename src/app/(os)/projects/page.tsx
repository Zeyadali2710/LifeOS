import { ProjectsList } from "@/features/projects/projects-list";
import { RouteState } from "@/features/shell/route-state";
import { sydneyYmd } from "@/server/calendar/free-slots";
import { db } from "@/server/db/client";
import { loadProjectsPage } from "@/server/projects-view";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Projects · LifeOS" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireOwner();
  const now = new Date();
  const data = await loadProjectsPage(db(), now);
  const creating = (await searchParams).new === "project";
  if (data.cards.length === 0 && !creating) return <RouteState route="projects" kind="empty" action={{ label: "New project", href: "/projects?new=project" }} />;
  return <ProjectsList data={data} today={sydneyYmd(now)} />;
}
