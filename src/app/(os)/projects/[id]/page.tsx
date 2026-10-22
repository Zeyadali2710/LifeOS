import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { ProjectDetail } from "@/features/projects/project-detail";
import { sydneyYmd } from "@/server/calendar/free-slots";
import { db } from "@/server/db/client";
import { githubRepos, projects } from "@/server/db/schema";
import { loadProject } from "@/server/project-queries";
import { projectObjective } from "@/server/projects-view";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Project · LifeOS" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const now = new Date();
  const h = db();
  const d = await loadProject(h, id, now);
  if (!d) notFound();
  const { task } = await searchParams;
  const [repos, others, objective] = await Promise.all([
    h.select({ id: githubRepos.id, fullName: githubRepos.fullName }).from(githubRepos).where(eq(githubRepos.archived, false)).orderBy(githubRepos.fullName),
    h.select({ id: projects.id, name: projects.name }).from(projects).where(and(ne(projects.id, id), ne(projects.status, "archived"))),
    projectObjective(h, id),
  ]);
  return <ProjectDetail key={d.project.updatedAt} d={d} repos={repos} projects={others} objective={objective} today={sydneyYmd(now)} openTaskId={z.uuid().safeParse(task).success ? task : undefined} />;
}
