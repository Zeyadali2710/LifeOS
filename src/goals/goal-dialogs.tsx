"use client";

import { useState } from "react";
import { GOAL_COLORS } from "@/lib/goals";
import type { GoalNode, GoalObjective } from "@/server/goals";
import { deleteGoalAction, deleteObjectiveAction, saveGoalAction, saveObjectiveAction } from "@/server/goals-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";

type Saved = (id: string | null) => void;
const COLOR_NAMES: Record<string, string> = { "#0a84ff": "Blue", "#ff9f0a": "Orange", "#ff6482": "Pink", "#30d158": "Green", "#64d2ff": "Cyan", "#bf5af2": "Purple" };

function useSave(onSaved: Saved, message: string) {
  const { toast } = useShell();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, msg = message) {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(msg);
    onSaved(r.id ?? null);
  }
  return { error, setError, busy, run };
}

export function GoalDialog({ goal, onClose, onSaved }: { goal: GoalNode | null; onClose: () => void; onSaved: Saved }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [color, setColor] = useState<string>(goal?.color ?? GOAL_COLORS[0]);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [status, setStatus] = useState(goal?.status ?? "active");
  const [confirm, setConfirm] = useState(false);
  const s = useSave(onSaved, goal ? "Goal saved" : "Goal added");
  const save = () => s.run(() => saveGoalAction({ title, color, targetDate: targetDate || null, status }, goal?.id));
  return (
    <Dialog open onClose={onClose} title={goal ? "Edit goal" : "New goal"} width={480}
      footerStart={goal ? <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete</Button> : undefined}
      actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={s.busy} onClick={save}>{goal ? "Save" : "Add goal"}</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Goal"><Input value={title} maxLength={200} placeholder="e.g. Land a security engineering internship" onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Target date (optional)"><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        <Field label="Colour">
          <Select value={color} onChange={(e) => setColor(e.target.value)}>{GOAL_COLORS.map((c) => <option key={c} value={c}>{COLOR_NAMES[c]}</option>)}</Select>
        </Field>
        {goal && (
          <Field label="Status" helper="Archived goals are hidden from this page.">
            <Select value={status} onChange={(e) => setStatus(e.target.value as GoalNode["status"])}>
              <option value="active">Active</option><option value="done">Done</option><option value="archived">Archived</option>
            </Select>
          </Field>
        )}
        {s.error && <p role="alert" className="text-[13px] text-red">{s.error}</p>}
        {confirm && goal && (
          <div role="alert" className="flex flex-col gap-2 rounded-14 border border-red/30 bg-red/[.06] p-3">
            <p className="text-[13px]">Delete “{goal.title}” and its {goal.objectives.length} objective{goal.objectives.length === 1 ? "" : "s"}? Linked projects and tasks are kept.</p>
            <div className="flex gap-2"><Button variant="destructive" size="sm" loading={s.busy} onClick={() => s.run(() => deleteGoalAction(goal.id), "Goal deleted")}>Delete goal</Button><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Keep</Button></div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function ObjectiveDialog({ goalId, objective, onClose, onSaved }: { goalId: string; objective: GoalObjective | null; onClose: () => void; onSaved: Saved }) {
  const [title, setTitle] = useState(objective?.title ?? "");
  const [targetDate, setTargetDate] = useState(objective?.targetDate ?? "");
  const [status, setStatus] = useState(objective?.status ?? "active");
  const [manual, setManual] = useState(objective?.manualProgress === null || objective?.manualProgress === undefined ? "" : String(objective.manualProgress));
  const [confirm, setConfirm] = useState(false);
  const s = useSave(onSaved, objective ? "Objective saved" : "Objective added");
  function save() {
    const progress = manual.trim() === "" ? null : Number(manual);
    if (progress !== null && !(Number.isInteger(progress) && progress >= 0 && progress <= 100)) { s.setError("Progress must be a whole number from 0 to 100."); return; }
    void s.run(() => saveObjectiveAction({ goalId, title, targetDate: targetDate || null, status, progress }, objective?.id));
  }
  return (
    <Dialog open onClose={onClose} title={objective ? "Edit objective" : "New objective"} width={480}
      footerStart={objective ? <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete</Button> : undefined}
      actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={s.busy} onClick={save}>{objective ? "Save" : "Add objective"}</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Objective" helper="A measurable outcome, e.g. “Apply to 6 internships”."><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Target date (optional)" helper="Sets which horizon it appears under."><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        <Field label="Manual progress % (optional)" helper="Leave empty to track progress from linked project tasks.">
          <Input inputMode="numeric" value={manual} placeholder="From tasks" onChange={(e) => setManual(e.target.value)} />
        </Field>
        {objective && (
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "active" | "done")}><option value="active">Active</option><option value="done">Done</option></Select>
          </Field>
        )}
        {s.error && <p role="alert" className="text-[13px] text-red">{s.error}</p>}
        {confirm && objective && (
          <div role="alert" className="flex flex-col gap-2 rounded-14 border border-red/30 bg-red/[.06] p-3">
            <p className="text-[13px]">Delete “{objective.title}”? Its projects are unlinked, not deleted.</p>
            <div className="flex gap-2"><Button variant="destructive" size="sm" loading={s.busy} onClick={() => s.run(() => deleteObjectiveAction(objective.id), "Objective deleted")}>Delete objective</Button><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Keep</Button></div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
