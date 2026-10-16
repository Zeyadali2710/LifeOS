"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HORIZON_LABEL, HORIZONS, type Horizon, type Momentum } from "@/lib/goals";
import type { GoalNode, GoalObjective, GoalProject, GoalsData } from "@/server/goals";
import { linkProjectAction, saveVisionAction, unlinkProjectAction } from "@/server/goals-actions";
import { toggleTaskAction } from "@/server/task-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Select, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { GoalDialog, ObjectiveDialog } from "./goal-dialogs";

const MOMENTUM: Record<Momentum, { label: string; cls: string }> = {
  rising: { label: "▲ rising", cls: "text-green" },
  steady: { label: "— steady", cls: "text-text-2" },
  slowing: { label: "▼ slowing", cls: "text-red" },
  quiet: { label: "○ no recent activity", cls: "text-text-3" },
};
const pct = (p: number | null) => (p === null ? "—" : `${p}%`);
const date = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

function Bar({ value, color, thin = false, className = "flex-1" }: { value: number | null; color: string; thin?: boolean; className?: string }) {
  return (
    <div className={`${thin ? "h-[3px]" : "h-1"} ${className} overflow-hidden rounded-full bg-white/[.06]`}>
      <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: color }} />
    </div>
  );
}

function Node({ title, color, progress, momentum, meta, on, neglected, onPick, label }: {
  title: string; color: string; progress: number | null; momentum: Momentum; meta: string; on: boolean; neglected?: boolean; onPick: () => void; label: string;
}) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onPick}
      className="flex w-full flex-col gap-2 rounded-12 border p-3 text-left transition-colors hover:!border-white/20"
      style={{ borderColor: on ? `${color}88` : "rgba(255,255,255,.07)", background: on ? `${color}14` : "rgba(255,255,255,.05)" }}>
      <span className="flex w-full items-center gap-2"><span className="size-[7px] flex-none rounded-[2px]" style={{ background: color }} /><span className="flex-1 text-[13.5px] leading-snug">{title}</span></span>
      <span className="flex w-full items-center gap-2"><Bar value={progress} color={color} thin /><span className="w-9 text-right text-[10.5px] text-text-2">{pct(progress)}</span></span>
      <span className="flex w-full flex-wrap items-center gap-2 text-[10.5px] text-text-3">
        <span className={MOMENTUM[momentum].cls}>{MOMENTUM[momentum].label}</span>
        {neglected && <span className="rounded-full border border-amber/40 px-1.5 text-amber">neglected</span>}
        <span className="flex-1" /><span>{meta}</span>
      </span>
    </button>
  );
}

function Column({ label, count, action, children, empty }: { label: string; count: number; action?: React.ReactNode; children: React.ReactNode; empty: string | null }) {
  return (
    <section aria-label={label} className="flex min-h-[320px] flex-col gap-2 border-r border-white/[.05] p-3.5 last:border-r-0">
      <div className="flex h-7 items-center gap-2 px-1">
        <span className="text-[10.5px] tracking-[.12em] text-text-2">{label.toUpperCase()}</span><span className="text-[10.5px] text-text-3">{count}</span>
        <span className="flex-1" />{action}
      </div>
      {empty !== null && <div className="rounded-10 border border-dashed border-white/[.08] p-4 text-[12.5px] leading-normal text-text-3">{empty}</div>}
      {children}
    </section>
  );
}

export function GoalsView({ data, archived }: { data: GoalsData; archived: boolean }) {
  const router = useRouter(), { toast, openAI } = useShell();
  const [horizon, setHorizon] = useState<Horizon>("month");
  const [sel, setSel] = useState<{ g?: string; o?: string; p?: string }>({});
  const [editingVision, setEditingVision] = useState(false);
  const [vision, setVision] = useState(data.vision);
  const [dialog, setDialog] = useState<{ kind: "goal"; goal: GoalNode | null } | { kind: "objective"; objective: GoalObjective | null; goalId: string } | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);
  // Optimistic task ticks: only shown while the server still reports the value they were made against.
  const [ticked, setTicked] = useState<Record<string, { next: boolean; base: boolean }>>({});
  const shown = (t: { id: string; done: boolean }) => (ticked[t.id] && ticked[t.id]!.base === t.done ? ticked[t.id]!.next : t.done);

  const active = data.goals; // archived goals are only loaded when the archived view is on
  const g = active.find((x) => x.id === sel.g) ?? active[0];
  const o = g?.objectives.find((x) => x.id === sel.o) ?? g?.objectives[0];
  const p: GoalProject | undefined = o?.projects.find((x) => x.id === sel.p) ?? o?.projects[0];
  const targets = active.flatMap((goal) => goal.objectives.filter((obj) => obj.status === "active" && obj.horizon === horizon).map((obj) => ({ goal, obj })));
  const linkable = data.projects.filter((x) => x.objectiveId !== o?.id);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) { toast(msg); router.refresh(); return true; }
      // Task actions return codes ("not_found"); goal actions return sentences.
      toast(r.error?.includes(" ") ? r.error : "Could not save that. Refresh and try again.", "error");
    } catch { toast("Could not save that. Try again.", "error"); }
    finally { setBusy(false); }
    return false;
  }
  const saved = () => { setDialog(null); router.refresh(); };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] tracking-[.12em] text-green">GOALS</p>
          <h1 className="font-display text-[clamp(36px,4.4vw,60px)] leading-[.95]">{data.headline}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openAI("Ask the Goals agent: how am I tracking against my goals, and what should I focus on next?")}><Icon name="auto_awesome" size={16} />Ask Goals</Button>
          <Button onClick={() => setDialog({ kind: "goal", goal: null })}><Icon name="add" size={16} />New goal</Button>
        </div>
      </header>

      <section aria-label="Long-term vision" className="relative flex flex-wrap items-center gap-5 overflow-hidden rounded-16 border border-[rgba(10,132,255,.22)] p-6"
        style={{ background: "radial-gradient(700px 200px at 50% 0%, rgba(10,132,255,.12), transparent 70%), rgba(255,255,255,.06)" }}>
        <div className="relative flex min-w-[260px] flex-[1_1_420px] flex-col gap-2">
          <span className="text-[10.5px] tracking-[.12em] text-cyan">LONG-TERM VISION</span>
          {editingVision ? (
            <div className="flex flex-col gap-2">
              <Textarea aria-label="Vision" rows={3} maxLength={500} value={vision} onChange={(e) => setVision(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={async () => { if (await act(() => saveVisionAction(vision), "Vision saved")) setEditingVision(false); }}>Save vision</Button>
                <Button size="sm" variant="secondary" onClick={() => { setVision(data.vision); setEditingVision(false); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-display text-[clamp(22px,2.4vw,29px)] leading-[1.12] text-pretty">{data.vision || <span className="text-text-3">Write the long-term vision your goals serve.</span>}</p>
              <Button variant="ghost" size="xs" onClick={() => setEditingVision(true)}><Icon name="edit" size={14} />Edit vision</Button>
            </div>
          )}
        </div>
        <div role="tablist" aria-label="Horizon" className="relative grid w-full grid-cols-4 gap-0.5 rounded-10 border border-white/[.07] bg-[rgba(18,18,20,.6)] p-[3px] tab:flex tab:w-auto">
          {HORIZONS.map((h) => (
            <button key={h} type="button" role="tab" aria-selected={horizon === h} onClick={() => setHorizon(h)}
              className={`h-[30px] shrink-0 rounded-full px-1 text-[9.5px] tracking-[.04em] whitespace-nowrap tab:px-3 tab:text-[11px] tab:tracking-[.12em] ${horizon === h ? "bg-white/10 text-text" : "text-text-3 hover:text-text"}`}>{HORIZON_LABEL[h]}</button>
          ))}
        </div>
      </section>

      <section aria-label={`${HORIZON_LABEL[horizon]} targets`} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-2.5">
        {targets.length === 0 ? (
          <p className="text-[13px] text-text-3">No active objectives due {horizon === "long" ? "later or without a date" : HORIZON_LABEL[horizon].toLowerCase()}.</p>
        ) : targets.map(({ goal, obj }) => (
          <button key={obj.id} type="button" onClick={() => setSel({ g: goal.id, o: obj.id })} className="glass-card flex flex-col gap-2.5 rounded-22 p-3.5 text-left">
            <span className="flex items-center gap-2"><span className="size-[7px] rounded-[2px]" style={{ background: goal.color }} /><span className="flex-1 truncate text-[10px] tracking-[.12em] text-text-3">{goal.title.toUpperCase()}</span><span className="text-[11px] text-text-2">{obj.progress === null ? "no tasks yet" : `${obj.progress}%`}</span></span>
            <span className="text-[14px] leading-snug">{obj.title}</span>
            <Bar value={obj.progress} color={goal.color} className="w-full" />
            <span className="flex items-center gap-2 text-[10.5px] text-text-3"><span className={MOMENTUM[obj.momentum].cls}>{MOMENTUM[obj.momentum].label}</span>{obj.neglected && <span className="text-amber">neglected</span>}<span className="flex-1" />{date(obj.targetDate ?? goal.targetDate)}</span>
          </button>
        ))}
      </section>

      <section aria-label="Goal tree" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] tracking-[.14em] whitespace-nowrap text-text-3">GOAL TREE</span>
          <span className="truncate text-[11px] text-text-4">{g ? `VISION → ${g.title.toUpperCase()}${o ? ` → ${o.title.toUpperCase()}` : ""}` : ""}</span>
          <span className="h-px flex-1 bg-white/[.06]" />
          <Link href={archived ? "/goals" : "/goals?archived=1"} className="text-[11px] whitespace-nowrap text-text-3 hover:text-text">{archived ? "Hide archived" : "Show archived"}</Link>
        </div>
        {active.length === 0 ? (
          <EmptyState icon="flag" title="No goals yet." body="Add a goal, break it into 2–3 measurable objectives, then link the projects that move them. Progress, momentum and neglect come from those projects' tasks." action={<Button onClick={() => setDialog({ kind: "goal", goal: null })}>New goal</Button>} />
        ) : (
          <div className="grid grid-cols-[repeat(4,minmax(240px,1fr))] overflow-x-auto rounded-16 border border-white/[.07] bg-white/[.04]">
            <Column label="Goal" count={active.length} empty={null}>
              {active.map((x) => (
                <div key={x.id} className="group relative">
                  <Node label={`Goal ${x.title}`} title={x.title} color={x.color} progress={x.progress} momentum={x.momentum} on={x.id === g?.id} neglected={x.neglected > 0}
                    meta={x.status !== "active" ? x.status : x.targetDate ? `by ${date(x.targetDate)}` : ""} onPick={() => setSel({ g: x.id })} />
                  <button type="button" aria-label={`Edit goal ${x.title}`} onClick={() => setDialog({ kind: "goal", goal: x })} className="absolute top-2 right-2 rounded-full p-1 text-text-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text"><Icon name="edit" size={14} /></button>
                </div>
              ))}
            </Column>
            <Column label="Objective" count={g?.objectives.length ?? 0}
              action={g && <Button variant="ghost" size="xs" aria-label="Add objective" onClick={() => setDialog({ kind: "objective", objective: null, goalId: g.id })}><Icon name="add" size={14} /></Button>}
              empty={g && !g.objectives.length ? "No objectives yet. Break this goal into 2–3 measurable outcomes." : null}>
              {g?.objectives.map((x) => (
                <div key={x.id} className="group relative">
                  <Node label={`Objective ${x.title}`} title={x.title} color={g.color} progress={x.progress} momentum={x.momentum} on={x.id === o?.id} neglected={x.neglected}
                    meta={x.status === "done" ? "done" : x.manualProgress !== null ? "manual" : x.targetDate ? date(x.targetDate) : ""} onPick={() => setSel({ g: g.id, o: x.id })} />
                  <button type="button" aria-label={`Edit objective ${x.title}`} onClick={() => setDialog({ kind: "objective", objective: x, goalId: g.id })} className="absolute top-2 right-2 rounded-full p-1 text-text-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text"><Icon name="edit" size={14} /></button>
                </div>
              ))}
            </Column>
            <Column label="Project" count={o?.projects.length ?? 0} empty={o && !o.projects.length ? "No projects linked. Link a project below, or create one in Projects." : !o ? "Pick an objective." : null}>
              {o?.projects.map((x) => (
                <div key={x.id} className="group relative">
                  <Node label={`Project ${x.name}`} title={x.name} color={g!.color} progress={x.progress} momentum={o.momentum} on={x.id === p?.id}
                    meta={x.total ? `${x.done}/${x.total} tasks` : "no tasks"} onPick={() => setSel({ g: g!.id, o: o.id, p: x.id })} />
                  <button type="button" aria-label={`Unlink project ${x.name}`} disabled={busy} onClick={() => act(() => unlinkProjectAction(x.id), "Project unlinked")} className="absolute top-2 right-2 rounded-full p-1 text-text-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text"><Icon name="link_off" size={14} /></button>
                </div>
              ))}
              {o && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Select aria-label="Project to link" value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="text-[12.5px]">
                    <option value="">Link a project…</option>
                    {linkable.map((x) => <option key={x.id} value={x.id}>{x.name}{x.objectiveId ? " (moves it)" : ""}</option>)}
                  </Select>
                  <Button size="xs" variant="secondary" disabled={!linkTo} loading={busy} onClick={async () => { if (await act(() => linkProjectAction(o.id, linkTo), "Project linked")) setLinkTo(""); }}>Link</Button>
                </div>
              )}
            </Column>
            <Column label="Task" count={p?.tasks.length ?? 0} empty={p && !p.tasks.length ? "No tasks in this project yet." : !p ? "Pick a project to see its tasks." : null}>
              {p?.tasks.map((x) => (
                <label key={x.id} className={`flex items-start gap-2.5 rounded-12 border border-white/[.07] p-3 text-[13px] ${shown(x) ? "bg-white/[.02] text-text-3 line-through" : "bg-white/5"}`}>
                  <input type="checkbox" checked={shown(x)} disabled={busy} className="mt-0.5 size-4 accent-[var(--color-green)]"
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setTicked((t) => ({ ...t, [x.id]: { next, base: x.done } }));
                      if (!(await act(() => toggleTaskAction(x.id, next), next ? "Task done" : "Task reopened"))) setTicked((t) => { const n = { ...t }; delete n[x.id]; return n; });
                    }} />
                  <span className="flex-1">{x.title}</span>
                  {x.blocked && <span className="flex items-center gap-1 text-[10.5px] text-amber" title="Blocked by another open task"><Icon name="lock" size={12} />blocked</span>}
                </label>
              ))}
              {p && <Link href={`/projects/${p.id}`} className="mt-1 px-1 text-[12px] text-text-2 hover:text-text">Open project →</Link>}
            </Column>
          </div>
        )}
      </section>

      {dialog?.kind === "goal" && <GoalDialog key={dialog.goal?.id ?? "new"} goal={dialog.goal} onClose={() => setDialog(null)} onSaved={(id) => { if (id) setSel({ g: id }); saved(); }} />}
      {dialog?.kind === "objective" && <ObjectiveDialog key={dialog.objective?.id ?? "new"} goalId={dialog.goalId} objective={dialog.objective} onClose={() => setDialog(null)} onSaved={(id) => { if (id) setSel({ g: dialog.goalId, o: id }); saved(); }} />}
    </div>
  );
}
