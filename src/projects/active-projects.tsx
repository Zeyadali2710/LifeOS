import Link from "next/link";
import { Sparkline } from "@/career/sparkline";
import type { ProjectCardDTO } from "@/lib/project-types";
import { EmptyState } from "@/legacy-ui/empty-state";
import { SectionHeader } from "@/legacy-ui/section-header";
import { ProgressRing } from "./progress-ring";
import { HealthDot, PriorityTag } from "./status";

export function ActiveProjects({ cards }: { cards: ProjectCardDTO[] }) {
  if (cards.length === 0) {
    return (
      <section aria-labelledby="h-projects">
        <SectionHeader id="h-projects" label="Active projects" link={{ href: "/projects", label: "All projects →" }} />
        <EmptyState
          icon="deployed_code"
          title="No active projects"
          body="Projects you mark Active show up here with progress and health."
          action={
            <Link
              href="/projects?new=project"
              className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[.03] px-3.5 text-[13px] font-medium text-text hover:bg-white/[.06]"
            >
              New project
            </Link>
          }
        />
      </section>
    );
  }
  return (
    <section aria-labelledby="h-projects">
      <SectionHeader id="h-projects" label="Active projects" meta={`${cards.length} active`} link={{ href: "/projects", label: "All projects →" }} />
      <div className="grid gap-3 tab:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.project.id}
            href={`/projects/${c.project.id}`}
            className="glass-card flex flex-col gap-3 rounded-24 border border-white/[.08] p-4 text-text hover:border-white/[.16]"
          >
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <PriorityTag priority={c.project.priority} />
                  <span className="truncate text-[13.5px] font-medium">{c.project.name}</span>
                </span>
                <HealthDot health={c.health} />
              </div>
              <ProgressRing pct={c.progress.pct} size={28} stroke={3} label={`${c.project.name} progress`} />
            </div>
            {c.repoSparkline && (
              <Sparkline
                data={c.repoSparkline}
                height={20}
                label={`Commits, last 14 days: ${c.repoSparkline.slice(-14).reduce((a, b) => a + b, 0)} total`}
              />
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
