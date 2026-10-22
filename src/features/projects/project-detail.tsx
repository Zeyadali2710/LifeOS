"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TaskDTO } from "@/lib/calendar-types";
import type { MilestoneDTO, ProjectWorkspaceDTO } from "@/lib/project-types";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/project-types";
import { addProjectDependencyAction, deleteProjectAction, removeLinkAction, removeProjectDependencyAction, setProjectArchivedAction } from "@/server/project-actions";
import { toggleTaskAction } from "@/server/task-actions";
import { clock, sydneyParts } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { TaskDialog } from "@/features/tasks/task-dialog";
import { Button, IconButton } from "@/ui/button";
import { Select } from "@/ui/controls";
import { ConfirmDialog } from "@/ui/overlay";
import { Page, Section } from "@/ui/layout";
import { LinkDialog, MilestoneDialog, ProjectDialog } from "./dialogs";
import { HEALTH, healthLabel, healthOf } from "./projects-list";
import s from "./projects.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${+m[3]!} ${MONTHS[+m[2]! - 1]}` : "—";
};
const when = (iso: string, today: string) => {
  const d = new Date(iso);
  const p = sydneyParts(d);
  const ymd = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return ymd === today ? clock(d) : `${p.day} ${MONTHS[p.month - 1]}`;
};

type Confirm = { title: string; body: string; label: string; run: () => Promise<void> } | null;

export function ProjectDetail({
  d,
  repos,
  projects,
  objective,
  today,
  openTaskId,
}: {
  d: ProjectWorkspaceDTO;
  repos: { id: number; fullName: string }[];
  projects: { id: string; name: string }[];
  objective: { id: string; title: string } | null;
  today: string;
  openTaskId?: string;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const p = d.project;
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState<TaskDTO | "new" | null>(() => d.tasks.find((t) => t.id === openTaskId) ?? null);
  const [milestone, setMilestone] = useState<MilestoneDTO | "new" | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [doneIds, setDoneIds] = useState<Record<string, boolean>>({});
  // Optimistic overrides only bridge until the server's tasks arrive; fresh props win.
  const [seenTasks, setSeenTasks] = useState(d.tasks);
  if (seenTasks !== d.tasks) {
    setSeenTasks(d.tasks);
    setDoneIds({});
  }

  const h = HEALTH[healthOf({ health: d.health, project: p })];
  const isDone = (t: TaskDTO) => doneIds[t.id] ?? Boolean(t.completedAt);
  const open = d.tasks.filter((t) => !isDone(t));
  const pct = d.progress.pct ?? 0;

  const toggle = async (t: TaskDTO) => {
    const blockers = d.blockedBy[t.id];
    if (!isDone(t) && blockers?.length) return toast(`Blocked: finish “${blockers[0]}” first.`, "error");
    const next = !isDone(t);
    setDoneIds((m) => ({ ...m, [t.id]: next }));
    const r = await toggleTaskAction(t.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setDoneIds((m) => ({ ...m, [t.id]: !next }));
      return toast("Couldn't update that task. Try again.", "error");
    }
    if (next) toast("Task done. Logged in Activity.");
    router.refresh();
  };

  const run = async (fn: () => Promise<{ ok: boolean }>, ok: string, after?: () => void) => {
    setBusy(true);
    const r = await fn().catch(() => ({ ok: false }));
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return toast("Couldn't do that. Try again.", "error");
    toast(ok);
    if (after) after();
    else router.refresh();
  };

  const copy = (text: string, msg: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast(msg),
      () => toast("Couldn't copy. Select the text instead.", "error"),
    );

  const ms = [...d.milestones].sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const current = ms.find((m) => !m.completedAt);
  const repoLinks = d.links.filter((l) => l.kind === "repo");
  const urlLinks = d.links.filter((l) => l.kind === "url");
  const depIds = new Set(d.dependsOn.map((x) => x.id));

  return (
    <Page label={`Project · ${p.name}`}>
      <Link href="/projects" className={s.back}>
        ← Projects
      </Link>
      <div className={s.dhead}>
        <div>
          <h1 className={s.dtitle}>{p.name}</h1>
          <div className={s.dsub}>
            {STATUS_LABEL[p.status]} · P{p.priority} · {CATEGORY_LABEL[p.category]}
            {objective && (
              <>
                {" "}
                · Objective: <Link href="/goals">{objective.title}</Link>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="lg" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="lg" disabled={busy} onClick={() => void run(() => setProjectArchivedAction(p.id, p.status !== "archived"), p.status === "archived" ? "Restored." : "Archived. Restore it from the Archived tab.")}>
            {p.status === "archived" ? "Restore" : "Archive"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            destructive
            onClick={() =>
              setConfirm({
                title: "Delete project?",
                body:
                  d.tasks.length + d.milestones.length + d.links.length > 0
                    ? `Delete “${p.name}”? Its ${d.tasks.length} tasks stay in your task list without a project, and ${d.milestones.length} milestones and ${d.links.length} links are removed. This can’t be undone.`
                    : `Delete “${p.name}”? This can’t be undone.`,
                label: "Delete project",
                run: () => run(() => deleteProjectAction(p.id, true), "Deleted. Tasks kept in your task list.", () => router.push("/projects")),
              })
            }
          >
            Delete
          </Button>
        </div>
      </div>

      <div className={s.dbody}>
        <div className={s.dmain}>
          <Section id="pt" label={`Tasks · ${open.length} open`} meta={<button type="button" className={s.labelBtn} style={{ fontFamily: "var(--font-ui)", fontSize: 13, letterSpacing: 0 }} onClick={() => setTask("new")}>+ Add task</button>}>
            <div>
              {d.tasks.map((t) => {
                const done = isDone(t);
                const blockers = !done ? d.blockedBy[t.id] : undefined;
                const late = !done && t.dueDate && t.dueDate < today;
                return (
                  <div key={t.id} className={s.trow}>
                    <button type="button" role="checkbox" aria-checked={done} aria-disabled={blockers?.length ? true : undefined} aria-label={t.title} className={s.check} onClick={() => void toggle(t)}>
                      {done ? "✓" : ""}
                    </button>
                    <span style={{ minWidth: 0 }}>
                      <button type="button" className={[s.ttitle, done && s.tdone].filter(Boolean).join(" ")} onClick={() => setTask(t)}>
                        {t.title}
                      </button>
                      {blockers?.length ? <span className={s.blockedBy}>Blocked by “{blockers.join("”, “")}”</span> : null}
                    </span>
                    <span className={[s.due, late && s.dueLate].filter(Boolean).join(" ")}>
                      {t.priority ? `P${t.priority}` : "—"} · {done ? "Done" : t.dueDate === today ? "Today" : short(t.dueDate)}
                    </span>
                  </div>
                );
              })}
              {d.tasks.length === 0 && <p className={s.small} style={{ padding: "16px 0" }}>No tasks yet. Add one or ask Projects to draft a plan from the repo.</p>}
            </div>
          </Section>

          <Section id="pm" label="Milestones and timeline" meta={<button type="button" className={s.labelBtn} style={{ fontFamily: "var(--font-ui)", fontSize: 13, letterSpacing: 0 }} onClick={() => setMilestone("new")}>+ Add milestone</button>}>
            {ms.length > 0 ? (
              <div className={s.mtl}>
                <div className={s.mtlLine} />
                {ms.map((m, i) => {
                  const left = ms.length > 1 ? (i / (ms.length - 1)) * 100 : 0;
                  const align = i === 0 ? "flex-start" : i === ms.length - 1 ? "flex-end" : "center";
                  const isCur = m === current;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={s.mpoint}
                      style={{ left: `${left}%`, transform: `translateX(${i === 0 ? "0" : i === ms.length - 1 ? "-100%" : "-50%"})`, alignItems: align }}
                      onClick={() => setMilestone(m)}
                      aria-label={`${m.title}, ${m.completedAt ? "done" : isCur ? "current" : "upcoming"}, ${short(m.dueDate)}`}
                    >
                      <span className={s.mdot} style={{ background: m.completedAt ? "var(--ink)" : "var(--paper)", borderColor: m.completedAt ? "var(--ink)" : isCur ? "var(--accent)" : "var(--border)" }} />
                      <span className={s.mname} style={{ fontWeight: isCur ? 600 : 400 }}>
                        {m.title}
                      </span>
                      <span className={s.mdate}>
                        {short(m.dueDate)} · {m.doneCount}/{m.taskCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={s.small}>No milestones.</p>
            )}
          </Section>

          <Section id="pa" label="Recent activity">
            <div>
              {d.activity.slice(0, 8).map((a) => (
                <div key={a.id} className={s.arow}>
                  <span className={s.atime}>{when(a.at, today)}</span>
                  <span>
                    {a.href ? (
                      <a href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined} style={{ color: "var(--ink-2)" }}>
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </span>
                </div>
              ))}
              {d.activity.length === 0 && <p className={s.small} style={{ padding: "12px 0" }}>No activity yet. Link a repository or complete a task.</p>}
            </div>
          </Section>
        </div>

        <aside className={s.dside} aria-label="Project summary">
          <div>
            <div className={s.big}>{pct}%</div>
            <div className={s.small} style={{ marginTop: 4 }}>
              {d.progress.basis === "milestones" ? `${d.progress.done} of ${d.progress.total} milestones done` : `${d.progress.done} of ${d.progress.total} tasks done`} · target {short(p.targetDate)}
            </div>
          </div>
          <div className={s.sideBlock}>
            <div className={s.label}>HEALTH</div>
            <div className={s.health} style={{ color: h.color }}>
              {h.mark} {healthLabel({ health: d.health, project: p })}
            </div>
            <div className={s.small}>{d.healthReason}</div>
            {d.blockers.map((b) => (
              <div key={b.refId} className={s.blocker}>
                {b.href ? <Link href={b.href}>{b.label}</Link> : b.label}
              </div>
            ))}
            {p.blockerNote && <div className={s.blocker}>{p.blockerNote}</div>}
          </div>
          <div className={s.sideBlock}>
            <div className={s.label}>
              <span>LINKED REPOSITORIES</span>
              <button type="button" className={s.labelBtn} onClick={() => setLinking(true)}>
                + LINK
              </button>
            </div>
            {repoLinks.map((l) =>
              l.kind === "repo" ? (
                <div key={l.id} className={s.repo}>
                  <Link href={`/career/${l.repo.fullName}`} style={{ display: "flex", flexDirection: "column", gap: 2, color: "var(--ink)" }}>
                    <span className={s.repoName}>{l.repo.fullName}</span>
                    <span style={{ fontSize: 12.5, color: l.repo.ci === "failing" ? "var(--status-failed)" : "var(--ink-3)" }}>
                      CI {l.repo.ci === "none" ? "not set up" : l.repo.ci} · {l.repo.openPrs} open PR{l.repo.openPrs === 1 ? "" : "s"}
                    </span>
                  </Link>
                  <IconButton
                    icon="close"
                    label={`Unlink ${l.repo.fullName}`}
                    small
                    size={16}
                    onClick={() => setConfirm({ title: "Remove link?", body: `Remove “${l.repo.fullName}” from this project? The repository itself is not affected.`, label: "Remove", run: () => run(() => removeLinkAction(l.id), "Link removed") })}
                  />
                </div>
              ) : null,
            )}
            {urlLinks.map((l) =>
              l.kind === "url" ? (
                <div key={l.id} className={s.repo}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                  <IconButton icon="close" label={`Remove ${l.label}`} small size={16} onClick={() => setConfirm({ title: "Remove link?", body: `Remove “${l.label}” from this project?`, label: "Remove", run: () => run(() => removeLinkAction(l.id), "Link removed") })} />
                </div>
              ) : null,
            )}
            {d.links.length === 0 && <span className={s.small} style={{ color: "var(--ink-3)" }}>None linked.</span>}
          </div>
          <div className={s.sideBlock}>
            <div className={s.label}>DEPENDS ON</div>
            {d.dependsOn.map((x) => (
              <div key={x.id} className={s.repo}>
                <Link href={`/projects/${x.id}`}>{x.name}</Link>
                <IconButton icon="close" label={`Remove dependency on ${x.name}`} small size={16} onClick={() => void run(() => removeProjectDependencyAction(p.id, x.id), "Dependency removed")} />
              </div>
            ))}
            <Select label="Add a project this one depends on" value="" onChange={(e) => e.target.value && void run(() => addProjectDependencyAction(p.id, e.target.value), "Dependency added")}>
              <option value="">Add a dependency…</option>
              {projects
                .filter((x) => !depIds.has(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </Select>
          </div>
          {(p.workspacePath || d.launchCommand) && (
            <div className={s.sideBlock}>
              <div className={s.label}>WORKSPACE · OWNER ONLY</div>
              <div className={s.ws}>
                {p.workspacePath}
                {p.workspaceMachine ? ` · ${p.workspaceMachine}` : ""}
                {d.launchCommand && (
                  <>
                    <br />$ {d.launchCommand}
                  </>
                )}
              </div>
              {d.launchCommand && (
                <Button size="sm" style={{ alignSelf: "flex-start" }} onClick={() => void copy(d.launchCommand!, "Copied launch command.")}>
                  Copy launch command
                </Button>
              )}
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Never sent to agents.</span>
            </div>
          )}
          <div className={s.sideBlock}>
            <div className={s.label}>
              <span>CONTEXT BRIEF</span>
              {d.brief && (
                <button type="button" className={s.labelBtn} onClick={() => void copy(d.brief, "Copied context brief.")}>
                  COPY
                </button>
              )}
            </div>
            {p.context ? <p className={s.brief}>{p.context}</p> : <span className={s.small} style={{ color: "var(--ink-3)" }}>No context yet. Add it in Edit.</span>}
          </div>
        </aside>
      </div>

      {editing && <ProjectDialog open project={p} onClose={() => setEditing(false)} />}
      {task && <TaskDialog open task={task === "new" ? undefined : task} defaultProjectId={p.id} onClose={() => setTask(null)} />}
      {milestone && <MilestoneDialog key={milestone === "new" ? "new" : milestone.id} open projectId={p.id} milestone={milestone === "new" ? undefined : milestone} onClose={() => setMilestone(null)} />}
      {linking && <LinkDialog open projectId={p.id} repos={repos} onClose={() => setLinking(false)} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => void confirm?.run()} title={confirm?.title ?? ""} body={confirm?.body ?? ""} confirmLabel={confirm?.label ?? ""} danger busy={busy} />
    </Page>
  );
}
