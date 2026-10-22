"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABEL, PROJECT_CATEGORIES, type ProjectCardDTO, type ProjectCategory } from "@/lib/project-types";
import { Button } from "@/legacy-ui/button";
import { EmptyState } from "@/legacy-ui/empty-state";
import { Icon } from "@/legacy-ui/icon";
import { ProjectCard } from "./project-card";
import { ProjectDialog } from "./project-dialog";

export type Filter = ProjectCategory | "all" | "archived";
export type Sort = "priority" | "due" | "recent";

const SORTS: { key: Sort; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "recent", label: "Recent" },
];

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// nulls last
const cmpNullLast = (a: string | null | undefined, b: string | null | undefined, dir: 1 | -1) =>
  a == null || b == null ? (a == null ? 1 : 0) - (b == null ? 1 : 0) : dir * a.localeCompare(b);

const SORT_FN: Record<Sort, (a: ProjectCardDTO, b: ProjectCardDTO) => number> = {
  priority: (a, b) => a.project.priority - b.project.priority || a.project.name.localeCompare(b.project.name),
  due: (a, b) => cmpNullLast(a.project.targetDate, b.project.targetDate, 1),
  recent: (a, b) => cmpNullLast(a.lastActivity?.at, b.lastActivity?.at, -1),
};

const chip = (on: boolean) =>
  `inline-flex h-8 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[13px] max-tab:min-h-11 ${
    on ? "border-[rgba(10,132,255,.45)] bg-[rgba(10,132,255,.12)] text-text" : "border-white/10 bg-white/[.03] text-text-2 hover:bg-white/[.06]"
  }`;

export function ProjectsView({
  cards,
  initialCategory,
  initialSort,
  today,
  now,
}: {
  cards: ProjectCardDTO[];
  initialCategory: Filter;
  initialSort: Sort;
  today: string;
  now: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialCategory);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [dialog, setDialog] = useState(false);

  // palette command: ?new=project opens the dialog once, then the param is dropped
  const newParam = useSearchParams().get("new");
  useEffect(() => {
    if (newParam !== "project") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL command, param is dropped right after
    setDialog(true);
    router.replace("/projects", { scroll: false });
    // only when the param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam]);

  const url = (f: Filter, s: Sort) => {
    const q = new URLSearchParams();
    if (f !== "all") q.set("category", f);
    if (s !== "priority") q.set("sort", s);
    const qs = q.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };
  const pick = (f: Filter, s: Sort) => {
    setFilter(f);
    setSort(s);
    router.replace(url(f, s), { scroll: false });
  };

  const live = useMemo(() => cards.filter((c) => c.project.status !== "archived"), [cards]);
  const archived = cards.length - live.length;
  const counts = useMemo(() => {
    const m = Object.fromEntries(PROJECT_CATEGORIES.map((c) => [c, 0])) as Record<ProjectCategory, number>;
    for (const c of live) m[c.project.category]++;
    return m;
  }, [live]);
  const shown = useMemo(() => {
    const base = filter === "all" ? live : filter === "archived" ? cards.filter((c) => c.project.status === "archived") : live.filter((c) => c.project.category === filter);
    return [...base].sort(SORT_FN[sort]);
  }, [cards, live, filter, sort]);

  const weekEnd = addDays(today, 7);
  const dueWeek = live.filter((c) => c.project.targetDate !== null && c.project.targetDate >= today && c.project.targetDate <= weekEnd).length;
  const atRisk = live.filter((c) => c.health === "at_risk").length;
  const meta = cards.length === 0 ? "No projects yet" : `${live.length} projects · ${dueWeek} due this week · ${atRisk} at risk`;
  const label = filter === "archived" ? "Archived" : filter === "all" ? "" : CATEGORY_LABEL[filter];
  const create = (
    <Button variant="secondary" onClick={() => setDialog(true)}>
      Create a project
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[13.5px] text-text-2">{meta}</p>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  onClick={() => pick(filter, s.key)}
                  className={`h-[26px] rounded-full px-3.5 text-[12.5px] max-tab:min-h-11 ${sort === s.key ? "bg-white/[.12] text-text" : "text-text-2"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button variant="primary" className="h-8" onClick={() => setDialog(true)}>
              <Icon name="add" size={16} />
              New project
            </Button>
          </div>
        </div>
        <div role="group" aria-label="Filter by category" className="flex snap-x gap-2 overflow-x-auto min-[760px]:snap-none">
          <button type="button" aria-pressed={filter === "all"} className={chip(filter === "all")} onClick={() => pick("all", sort)}>
            All <span className="text-text-3">{live.length}</span>
          </button>
          {PROJECT_CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={filter === c} className={chip(filter === c)} onClick={() => pick(c, sort)}>
              {CATEGORY_LABEL[c]} <span className="text-text-3">{counts[c]}</span>
            </button>
          ))}
          {archived > 0 && (
            <button type="button" aria-pressed={filter === "archived"} className={chip(filter === "archived")} onClick={() => pick("archived", sort)}>
              Archived <span className="text-text-3">{archived}</span>
            </button>
          )}
        </div>
      </div>
      <span aria-live="polite" className="sr-only">{`${shown.length} projects shown`}</span>
      {cards.length === 0 ? (
        <EmptyState
          icon="deployed_code"
          title="No projects yet"
          body="A project groups tasks, milestones and repositories toward one outcome. Create your first one to start tracking progress."
          action={create}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="deployed_code"
          title={`No projects in ${label}`}
          body="Nothing is filed under this category yet. Create one or pick another filter."
          action={create}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
          {shown.map((c) => (
            <ProjectCard key={c.project.id} card={c} today={today} now={now} />
          ))}
        </div>
      )}
      <ProjectDialog open={dialog} onClose={() => setDialog(false)} />
    </>
  );
}
