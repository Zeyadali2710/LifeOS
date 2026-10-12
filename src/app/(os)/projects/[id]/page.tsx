import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { ProjectWorkspace } from "@/projects/project-workspace";
import { sydneyYmd } from "@/server/calendar/free-slots";
import { db } from "@/server/db/client";
import { githubRepos, projects } from "@/server/db/schema";
import { loadProject } from "@/server/project-queries";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Project · LifeOS" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const now = new Date();
  const d = await loadProject(db(), id, now);
  if (!d) notFound();
  const { task } = await searchParams;
  const repos = await db().select({ id: githubRepos.id, fullName: githubRepos.fullName }).from(githubRepos).where(eq(githubRepos.archived, false)).orderBy(githubRepos.fullName);
  const projectsForDeps = await db()
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(ne(projects.id, id), ne(projects.status, "archived")));
  return (
    <div className="mx-auto max-w-[1480px]">
      <ProjectWorkspace d={d} repos={repos} projectsForDeps={projectsForDeps} today={sydneyYmd(now)} now={now.toISOString()} openTaskId={z.uuid().safeParse(task).success ? task : undefined} />
    </div>
  );
}
