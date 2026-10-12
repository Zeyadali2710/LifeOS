"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityFeed } from "@/career/activity-feed";
import { RepoCard } from "@/career/repo-card";
import { CATEGORY_LABEL, type ProjectWorkspaceDTO } from "@/lib/project-types";
import { removeLinkAction, removeProjectDependencyAction, deleteProjectAction, setProjectArchivedAction } from "@/server/project-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { SectionHeader } from "@/ui/section-header";
import { BlockersList } from "./blockers-list";
import { DependencyPicker } from "./dependency-picker";
import { LinkDialog } from "./link-dialog";
import { ContextCard } from "./context-card";
import { ProgressRing } from "./progress-ring";
import { ProjectDialog } from "./project-dialog";
import { MilestoneList, ProjectTasks } from "./project-tasks";
import { HealthDot, PriorityTag, StatusChip } from "./status";
import { TimelineStrip } from "./timeline-strip";
import { WorkspaceCard } from "./workspace-card";

type Repo = { id: number; fullName: string };
type Confirm = { title: string; body: string; label: string; run: () => Promise<void> } | null;

const fmtDate = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};
const IBTN = "grid size-7 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11";

export function ProjectWorkspace({
  d,
  repos,
  projectsForDeps,
  today,
  now,
  openTaskId,
}: {
  d: ProjectWorkspaceDTO;
  repos: Repo[];
  projectsForDeps: { id: string; name: string }[];
  today: string;
  now: string;
  openTaskId?: string;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const p = d.project;
  const archived = p.status === "archived";
  const [edit, setEdit] = useState<null | { focus?: "workspacePath" | "context" }>(null);
  const [link, setLink] = useState(false);
  const [dep, setDep] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [menu]);

  const closeMenu = () => {
    setMenu(false);
    menuBtn.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      return closeMenu();
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const setArchived = async (next: boolean) => {
    setMenu(false);
    const r = await setProjectArchivedAction(p.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) return toast("Couldn't save that. Try again.", "error");
    toast(next ? "Project archived" : "Project unarchived");
    router.refresh();
  };

  const nTasks = d.tasks.length;
  const nMs = d.milestones.length;
  const nLinks = d.links.length;
  const hasData = nTasks + nMs + nLinks > 0;
  const askDelete = () => {
    setMenu(false);
    setConfirm({
      title: "Delete project",
      body: hasData
        ? `Delete "${p.name}"? Its ${nTasks} tasks stay in your task list without a project, and ${nMs} milestones and ${nLinks} links are removed. This can't be undone.`
        : `Delete "${p.name}"? This can't be undone.`,
      label: "Delete project",
      run: async () => {
        // The user already confirmed in this dialog; the server guard is for other callers (incl. dependency edges this page can't see).
        const r = await deleteProjectAction(p.id, true).catch(() => ({ ok: false }) as const);
        if (!r.ok) return void toast("Couldn't delete that. Try again.", "error");
        toast("Project deleted");
        router.push("/projects");
      },
    });
  };
  const askRemove = (label: string, run: () => Promise<{ ok: boolean }>) =>
    setConfirm({
      title: "Remove link",
      body: `Remove "${label}" from this project? The repository itself is not affected.`,
      label: "Remove",
      run: async () => {
        const r = await run().catch(() => ({ ok: false }));
        if (!r.ok) return void toast("Couldn't save that. Try again.", "error");
        router.refresh();
      },
    });

  const taskLine =
    d.progress.basis === "tasks"
      ? `${d.progress.done} of ${d.progress.total} tasks done`
      : d.progress.basis === "milestones"
        ? `${d.progress.done} of ${d.progress.total} milestones done`
        : "No tasks yet";
  const linked = new Set(d.dependsOn.map((x) => x.id));

  return (
    <div>
      <header className="mb-6">
        <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-2 hover:text-text">
          <Icon name="arrow_back" size={16} /> Projects
        </Link>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] tracking-[0.1em] text-cyan uppercase">{CATEGORY_LABEL[p.category]}</p>
            <h1 className="font-display text-[40px] leading-[1.05] font-normal break-words">{p.name}</h1>
            {p.description && <p className="mt-2 max-w-[60ch] text-[14px] text-text-2">{p.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusChip status={p.status} />
              <HealthDot health={d.health} />
              <PriorityTag priority={p.priority} />
              <span className="inline-flex items-center gap-1 text-[12.5px] text-text-2">
                <Icon name="schedule" size={14} />
                {p.targetDate ? `Target ${fmtDate(p.targetDate)}` : "No target date"}
              </span>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <ProgressRing pct={d.progress.pct} size={72} stroke={6} label={`${p.name} progress`} done={p.status === "done"} />
            {!archived && (
              <Button variant="secondary" size="sm" onClick={() => setEdit({})}>
                Edit project
              </Button>
            )}
            <div className="relative">
              <button
                ref={menuBtn}
                type="button"
                aria-label="Project actions"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
                className={IBTN}
              >
                <Icon name="more_horiz" size={18} />
              </button>
              {menu && (
                <div ref={menuRef} role="menu" onKeyDown={onMenuKey} className="glass-menu absolute top-9 right-0 z-10 flex w-52 flex-col rounded-24 p-1.5">
                  <button role="menuitem" type="button" className="rounded-[18px] px-3 py-2 text-left text-[13px] hover:bg-fill-2" onClick={() => void setArchived(!archived)}>
                    {archived ? "Unarchive project" : "Archive project"}
                  </button>
                  <button role="menuitem" type="button" className="rounded-[18px] px-3 py-2 text-left text-[13px] text-red hover:bg-fill-2" onClick={askDelete}>
                    Delete project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {archived && (
          <div className="mt-4 flex items-center gap-3 rounded-16 bg-white/[.05] px-4 py-3 text-[13px] text-text-2">
            <span className="flex-1">This project is archived.</span>
            <Button variant="secondary" size="xs" onClick={() => void setArchived(false)}>
              Unarchive project
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 flex min-w-0 flex-col gap-6 desk:order-none">
          <section aria-labelledby="ws-h" className="order-1">
            <SectionHeader id="ws-h" label="Workspace" />
            <WorkspaceCard
              path={p.workspacePath}
              machine={p.workspaceMachine}
              brief={d.brief}
              launchCommand={d.launchCommand}
              primaryRepoUrl={d.primaryRepoUrl}
              onSetWorkspace={() => setEdit({ focus: "workspacePath" })}
            />
          </section>
          <section aria-label="Context" className="order-1">
            <ContextCard context={p.context} onEdit={archived ? undefined : () => setEdit({ focus: "context" })} />
          </section>
          <section aria-labelledby="tasks-h">
            <SectionHeader id="tasks-h" label="Tasks" />
            <ProjectTasks projectId={p.id} tasks={d.tasks} blockedBy={d.blockedBy} milestones={d.milestones} today={today} readOnly={archived} openTaskId={openTaskId} />
          </section>
          <section id="milestones" aria-labelledby="ms-h">
            <SectionHeader id="ms-h" label="Milestones and timeline" />
            <div className="glass-card rounded-24 p-5">
              <TimelineStrip milestones={d.milestones} tasks={d.tasks} targetDate={p.targetDate} today={today} />
              <MilestoneList projectId={p.id} milestones={d.milestones} today={today} readOnly={archived} />
            </div>
          </section>
          <section aria-labelledby="act-h">
            <SectionHeader id="act-h" label="Recent activity" />
            <ActivityFeed items={d.activity} now={now} label="Recent activity" empty="No activity yet. Link a repository or complete a task." />
          </section>
        </div>

        <aside className="order-1 flex min-w-0 flex-col gap-6 desk:order-none">
          <section aria-labelledby="blk-h">
            <SectionHeader id="blk-h" label="Blockers" />
            <BlockersList blockers={d.blockers} note={p.blockerNote} onEditNote={archived ? undefined : () => setEdit({})} />
          </section>
          <section aria-labelledby="health-h">
            <SectionHeader id="health-h" label="Health" />
            <div className="glass-card rounded-24 p-5">
              <HealthDot health={d.health} />
              <p className="mt-1 text-[13px] text-text-2">{d.healthReason}</p>
              <p className="mt-2 font-mono text-[11.5px] text-text-3">{taskLine}</p>
            </div>
          </section>
          <section aria-labelledby="repos-h">
            <SectionHeader id="repos-h" label="Linked repositories" />
            <div className="flex flex-col gap-3">
              {!d.githubConnected && (
                <p className="text-[12.5px] text-text-2">
                  GitHub isn&apos;t connected.{" "}
                  <Link href="/settings" className="underline hover:text-text">
                    Settings
                  </Link>
                </p>
              )}
              {d.links.map((l) =>
                l.kind === "repo" ? (
                  <div key={l.id} className="relative">
                    <RepoCard repo={l.repo} compact now={now} />
                    {!archived && (
                      <button type="button" aria-label={`Remove ${l.repo.fullName}`} className={`${IBTN} absolute top-2 right-2`} onClick={() => askRemove(l.repo.fullName, () => removeLinkAction(l.id))}>
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={l.id} className="glass-card flex items-center gap-2 rounded-16 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{l.label}</p>
                      <p className="truncate font-mono text-[11px] text-text-3">{host(l.url)}</p>
                    </div>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.label}`} className={IBTN}>
                      <Icon name="open_in_new" size={16} />
                    </a>
                    {!archived && (
                      <button type="button" aria-label={`Remove ${l.label}`} className={IBTN} onClick={() => askRemove(l.label, () => removeLinkAction(l.id))}>
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ),
              )}
              {!archived && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="xs" onClick={() => setLink(true)}>
                    Link repository
                  </Button>
                  <Button variant="secondary" size="xs" onClick={() => setLink(true)}>
                    Add link
                  </Button>
                </div>
              )}
            </div>
          </section>
          <section aria-labelledby="dep-h">
            <SectionHeader id="dep-h" label="Depends on" />
            <div className="flex flex-wrap items-center gap-2">
              {d.dependsOn.map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-white/[.07] py-1 pr-1 pl-3 text-[12.5px]">
                  <Link href={`/projects/${x.id}`} className="hover:underline">
                    {x.name}
                  </Link>
                  {!archived && (
                    <button
                      type="button"
                      aria-label={`Remove dependency on ${x.name}`}
                      className="grid size-5 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text"
                      onClick={async () => {
                        const r = await removeProjectDependencyAction(p.id, x.id).catch(() => ({ ok: false }) as const);
                        if (!r.ok) return toast("Couldn't save that. Try again.", "error");
                        router.refresh();
                      }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
              {!archived && (
                <Button variant="secondary" size="xs" onClick={() => setDep(true)}>
                  Add dependency
                </Button>
              )}
            </div>
          </section>
        </aside>
      </div>

      <ProjectDialog open={!!edit} project={p} focus={edit?.focus} onClose={() => setEdit(null)} />
      <LinkDialog open={link} projectId={p.id} repos={repos} onClose={() => setLink(false)} />
      <DependencyPicker
        open={dep}
        kind="project"
        subjectId={p.id}
        options={projectsForDeps.filter((x) => !linked.has(x.id)).map((x) => ({ id: x.id, title: x.name }))}
        onClose={() => setDep(false)}
      />
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        initialFocus={() => document.querySelector<HTMLElement>("[data-cancel]")}
        actions={
          <>
            <Button data-cancel variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await confirm?.run();
                setBusy(false);
                setConfirm(null);
              }}
            >
              {confirm?.label}
            </Button>
          </>
        }
      >
        {confirm?.body}
      </Dialog>
    </div>
  );
}
