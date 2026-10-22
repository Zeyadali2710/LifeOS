"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HORIZONS, type Horizon, type Momentum } from "@/lib/goals";
import type { GoalObjective, GoalsData } from "@/server/goals";
import { linkProjectAction, saveVisionAction, unlinkProjectAction } from "@/server/goals-actions";
import { toggleTaskAction } from "@/server/task-actions";
import { useShell } from "@/features/shell/shell-provider";
import { PAGE_STATES } from "@/features/shell/page-states";
import { Button, ButtonLink } from "@/ui/button";
import { Checkbox, SelectField, TextField } from "@/ui/controls";
import { Progress, Status, type Tone } from "@/ui/display";
import { Alert, PageState } from "@/ui/feedback";
import { Card, Page, PageHeader, Section } from "@/ui/layout";
import { Dialog } from "@/ui/overlay";
import { GoalDialog, type GoalEditor } from "./goal-dialogs";
import s from "./goals.module.css";

const MOMENTUM: Record<Momentum, { glyph: string; label: string; tone: Tone }> = {
  rising: { glyph: "↑", label: "Rising", tone: "working" },
  steady: { glyph: "→", label: "Steady", tone: "idle" },
  slowing: { glyph: "↓", label: "Slowing", tone: "approval" },
  quiet: { glyph: "–", label: "No recent activity", tone: "idle" },
};
const HORIZON_LABEL = { all: "All horizons", week: "This week", month: "This month", year: "This year", long: "Long term" };
const pct = (value: number | null) => value === null ? "—" : `${value}%`;
const date = (value: string | null) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No target date";

function MomentumLabel({ value }: { value: Momentum }) {
  const m = MOMENTUM[value];
  return <Status tone={m.tone} glyph={m.glyph} mono className={s.momentum}>{m.label}</Status>;
}

function Vision({ value }: { value: string }) {
  const { toast } = useShell();
  const router = useRouter();
  const [vision, setVision] = useState(value);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null);
    try {
      const result = await saveVisionAction(vision);
      if (!result.ok) { setError(result.error); return; }
      setVision(vision.trim());
      toast("Vision saved"); router.refresh();
    } catch { setError("Could not save the vision. Try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className={s.vision} onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <TextField label="Vision" value={vision} maxLength={500} disabled={busy} placeholder="Write the long-term vision your goals serve." onChange={(e) => setVision(e.target.value)} />
    {vision !== value && <div className={`${s.actions} ${s.visionActions}`}><Button type="submit" variant="primary" size="sm" disabled={busy}>{busy ? "Saving…" : "Save vision"}</Button><Button size="sm" disabled={busy} onClick={() => { setVision(value); setError(null); }}>Cancel</Button></div>}
    {error && <Alert>{error}</Alert>}
  </form>;
}

function ObjectiveDetail({ objective, data, onClose, onEdit }: { objective: GoalObjective; data: GoalsData; onClose: () => void; onEdit: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, { next: boolean; base: boolean }>>({});
  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error?.includes(" ") ? r.error : "Could not save that. Refresh and try again."); return false; }
      toast(message); router.refresh(); return true;
    } catch { setError("Could not save that. Try again."); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog open wide onClose={() => { if (!lock.current) onClose(); }} title={objective.title} footer={<><Button onClick={onEdit} disabled={busy} icon="edit">Edit objective</Button><Button onClick={onClose} disabled={busy}>Close</Button></>}>
    <div className={s.detail}>
      <div className={s.actions}><MomentumLabel value={objective.momentum} />{objective.status === "done" && <Status tone="working" glyph="✓">Done</Status>}<span className={s.meta}>{date(objective.targetDate)} · {pct(objective.progress)}{objective.manualProgress !== null ? " · manual" : ""}</span></div>
      {objective.projects.length === 0 && <p className={s.meta}>No projects linked. Link a project below, or create one in Projects.</p>}
      {objective.projects.map((project) => <Card key={project.id} className={s.project}>
        <div className={s.projectHead}><ButtonLink href={`/projects/${project.id}`} variant="text">{project.name} →</ButtonLink><span className={s.meta}>{project.done}/{project.total} tasks</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => unlinkProjectAction(project.id), "Project unlinked")} aria-label={`Unlink project ${project.name}`}>Unlink</Button></div>
        <Progress value={project.progress ?? 0} label={`${project.name}: ${project.progress === null ? "no tasks yet" : pct(project.progress)}`} />
        {!project.tasks.length && <p className={s.meta}>No tasks in this project yet.</p>}
        {project.tasks.map((task) => {
          const done = ticked[task.id]?.base === task.done ? ticked[task.id]!.next : task.done;
          return <div key={task.id} className={s.task}>
            <Checkbox label={<span className={done ? s.taskDone : undefined}>{task.title}</span>} checked={done} disabled={busy || task.blocked} onChange={async (e) => {
              const next = e.target.checked;
              setTicked((values) => ({ ...values, [task.id]: { next, base: task.done } }));
              if (!(await act(() => toggleTaskAction(task.id, next), next ? "Task done" : "Task reopened"))) setTicked((values) => { const copy = { ...values }; delete copy[task.id]; return copy; });
            }} />
            {task.blocked && <Status tone="approval" glyph="!">Blocked by an open task</Status>}
          </div>;
        })}
      </Card>)}
      <div className={s.link}><SelectField label="Project to link" value={linkTo} disabled={busy} help="Each project counts toward one objective. Linking it here moves it from its current objective." onChange={(e) => setLinkTo(e.target.value)}>
        <option value="">Choose a project…</option>
        {data.projects.filter((project) => project.objectiveId !== objective.id).map((project) => <option key={project.id} value={project.id}>{project.name}{project.objectiveId ? " (moves it)" : ""}</option>)}
      </SelectField><Button variant="primary" disabled={busy || !linkTo} onClick={async () => { if (await act(() => linkProjectAction(objective.id, linkTo), "Project linked")) setLinkTo(""); }}>Link project</Button></div>
      {error && <Alert>{error}</Alert>}
    </div>
  </Dialog>;
}

export function GoalsView({ data, archived }: { data: GoalsData; archived: boolean }) {
  const router = useRouter();
  const { openAI } = useShell();
  const [horizon, setHorizon] = useState<Horizon | "all">("all");
  const [editor, setEditor] = useState<GoalEditor | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const objective = data.goals.flatMap((goal) => goal.objectives).find((obj) => obj.id === selected);
  const active = data.goals.filter((goal) => goal.status === "active");
  const rising = active.filter((goal) => goal.momentum === "rising").length;
  const neglected = active.reduce((sum, goal) => sum + goal.neglected, 0);
  return <Page label="Goals">
    <PageHeader title="Goals" sub={`${rising} of ${active.length} active goals rising · ${neglected} objective${neglected === 1 ? "" : "s"} neglected`} actions={<Button variant="primary" onClick={() => setEditor({ kind: "goal", goal: null })}>New goal</Button>} />
    <Vision key={data.vision} value={data.vision} />
    <div className={s.horizons} role="radiogroup" aria-label="Horizon" onKeyDown={(e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (["ArrowLeft", "ArrowUp"].includes(e.key) ? buttons.length - 1 : 1)) % buttons.length;
      buttons[next]?.focus(); buttons[next]?.click();
    }}>
      {(["all", ...HORIZONS] as const).map((h) => <button key={h} type="button" role="radio" aria-checked={horizon === h} tabIndex={horizon === h ? 0 : -1} className={s.horizon} onClick={() => setHorizon(h)}>{HORIZON_LABEL[h]}</button>)}
    </div>
    {data.goals.length === 0 && <PageState inline kind="empty" agent="goals" title={PAGE_STATES.goals.empty[0]} body={PAGE_STATES.goals.empty[1]} action={{ label: "New goal", onClick: () => setEditor({ kind: "goal", goal: null }) }} />}
    {data.goals.map((goal) => {
      const objectives = goal.objectives.filter((obj) => horizon === "all" || obj.horizon === horizon);
      return <Section key={goal.id} id={`goal-${goal.id}`} label={goal.title} meta={pct(goal.progress)} className={s.goal}>
        <div className={s.goalMeta}><span className={s.actions}><MomentumLabel value={goal.momentum} />{goal.status !== "active" && <Status tone={goal.status === "done" ? "working" : "idle"} glyph={goal.status === "done" ? "✓" : "–"}>{goal.status === "done" ? "Done" : "Archived"}</Status>}</span><span className={s.meta}>mean of measurable objectives</span></div>
        {objectives.map((obj) => <div key={obj.id} className={s.objective}>
          <div className={s.objectiveInfo}>
            <button type="button" className={s.objectiveName} title={obj.title} aria-label={`Open objective ${obj.title}`} onClick={() => setSelected(obj.id)}>{obj.title}</button>
            <p className={s.projectLine}>{obj.projects.length ? obj.projects.map((project) => project.name).join(", ") : "No linked project"} · target {date(obj.targetDate ?? goal.targetDate)}</p>
            {obj.neglected && <Status tone="approval" glyph="▲" className={s.neglected}>Neglected: no activity since {date(obj.lastActivity.slice(0, 10))}</Status>}
            {obj.status === "done" && <Status tone="working" glyph="✓">Done</Status>}
          </div>
          <div className={s.progress}><Progress value={obj.progress ?? 0} label={`${obj.title}: ${obj.progress === null ? "no tasks yet" : pct(obj.progress)}`} /><span className={s.progressLabel}>{obj.progress === null ? "— no tasks yet" : `${obj.progress}%${obj.manualProgress !== null ? " · manual" : ""}`}</span></div>
          <MomentumLabel value={obj.momentum} />
          {obj.projects[0] ? <ButtonLink href={`/projects/${obj.projects[0].id}`} variant="text">Open project →</ButtonLink> : <Button variant="text" onClick={() => setSelected(obj.id)}>Link project</Button>}
        </div>)}
        {!objectives.length && <p className={s.empty}>{goal.objectives.length ? "No objectives in this horizon." : "No objectives yet. Break this goal into 2–3 measurable outcomes."}</p>}
        <div className={s.goalActions}><Button variant="text" size="sm" onClick={() => setEditor({ kind: "objective", objective: null, goalId: goal.id })}>Add objective</Button><Button variant="ghost" size="sm" onClick={() => setEditor({ kind: "goal", goal })} aria-label={`Edit goal ${goal.title}`}>Edit goal</Button>{goal.targetDate && <span className={s.meta}>Target {date(goal.targetDate)}</span>}</div>
      </Section>;
    })}
    <p className={s.note}>Momentum compares linked tasks done in the last 14 days with the 14 before. An objective is neglected after 21 days without activity. Each project counts toward one objective only.</p>
    <div className={`${s.actions} ${s.visionActions}`}><ButtonLink href={archived ? "/goals" : "/goals?archived=1"} variant="ghost" size="sm">{archived ? "Hide archived" : "Show archived"}</ButtonLink><Button variant="ghost" size="sm" icon="auto_awesome" onClick={() => openAI("Ask the Goals agent: how am I tracking against my goals, and what should I focus on next?")}>Ask Goals</Button></div>
    {objective && !editor && <ObjectiveDetail key={objective.id} objective={objective} data={data} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); setEditor({ kind: "objective", objective, goalId: objective.goalId }); }} />}
    {editor && <GoalDialog key={editor.kind === "goal" ? editor.goal?.id ?? "new-goal" : editor.objective?.id ?? `new-${editor.goalId}`} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); router.refresh(); }} />}
  </Page>;
}
