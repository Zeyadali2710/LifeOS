import Link from "next/link";
import { PROJECT_CATEGORIES, type ProjectCardDTO } from "@/lib/project-types";
import { ProjectsView, type Filter, type Sort } from "@/projects/projects-view";
import { db } from "@/server/db/client";
import { listProjects } from "@/server/project-queries";
import { sydneyYmd } from "@/server/calendar/free-slots";
import { requireOwner } from "@/server/session";
import { PageHeader } from "@/legacy-ui/page-header";

export const metadata = { title: "Projects · LifeOS" };
export const dynamic = "force-dynamic";

const SORTS: readonly string[] = ["priority", "due", "recent"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ category?: string; sort?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const category = (sp.category === "archived" || PROJECT_CATEGORIES.some((c) => c === sp.category) ? sp.category : "all") as Filter;
  const sort = (SORTS.includes(sp.sort ?? "") ? sp.sort : "priority") as Sort;
  const now = new Date();

  let cards: ProjectCardDTO[] | null = null;
  try {
    cards = await listProjects(db(), now);
  } catch (e) {
    console.error("projects: load failed", e instanceof Error ? e.name : "unknown");
  }

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <PageHeader eyebrow={{ text: "PROJECTS", className: "text-cyan" }} title="Projects" lead="Everything you're building, in one place." />
      {cards ? (
        <ProjectsView cards={cards} initialCategory={category} initialSort={sort} today={sydneyYmd(now)} now={now.toISOString()} />
      ) : (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-24 border border-[rgba(255,105,97,.3)] bg-[rgba(255,105,97,.06)] p-5 text-[13.5px] text-text-2">
          Couldn&apos;t load projects.
          <Link href="/projects" className="text-text underline">
            Try again
          </Link>
        </div>
      )}
    </div>
  );
}
