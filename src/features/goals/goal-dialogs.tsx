"use client";

import { useRef, useState } from "react";
import { GOAL_COLORS, goalInput, objectiveInput } from "@/lib/goals";
import type { GoalNode, GoalObjective } from "@/server/goals";
import { deleteGoalAction, deleteObjectiveAction, saveGoalAction, saveObjectiveAction } from "@/server/goals-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { SelectField, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import s from "./goals.module.css";

export type GoalEditor = { kind: "goal"; goal: GoalNode | null } | { kind: "objective"; objective: GoalObjective | null; goalId: string };
const COLOR_NAMES = ["Blue", "Orange", "Pink", "Green", "Cyan", "Purple"];

export function GoalDialog({ editor, onClose, onSaved }: { editor: GoalEditor; onClose: () => void; onSaved: () => void }) {
  const isGoal = editor.kind === "goal";
  const item = isGoal ? editor.goal : editor.objective;
  const noun = isGoal ? "goal" : "objective";
  const { toast } = useShell();
  const [title, setTitle] = useState(item?.title ?? "");
  const [targetDate, setTargetDate] = useState(item?.targetDate ?? "");
  const [status, setStatus] = useState(item?.status ?? "active");
  const [color, setColor] = useState<string>(isGoal && editor.goal ? editor.goal.color : GOAL_COLORS[0]);
  const [manual, setManual] = useState(!isGoal && editor.objective?.manualProgress != null ? String(editor.objective.manualProgress) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discard, setDiscard] = useState(false);
  const snapshot = JSON.stringify([title, targetDate, status, color, manual]);
  const [initial] = useState(snapshot);
  const close = () => { if (!lock.current) { if (snapshot !== initial) setDiscard(true); else onClose(); } };

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) { setError(result.error ?? "Could not save that. Try again."); return; }
      toast(message);
      onSaved();
    } catch { setError("Could not save that. Try again."); }
    finally { lock.current = false; setBusy(false); }
  }

  function save() {
    if (isGoal) {
      const parsed = goalInput.safeParse({ title, color, targetDate: targetDate || null, status });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entered values."); return; }
      void run(() => saveGoalAction(parsed.data, item?.id), item ? "Goal saved" : "Goal added");
    } else {
      const progress = manual.trim() === "" ? null : Number(manual);
      if (progress !== null && !(Number.isInteger(progress) && progress >= 0 && progress <= 100)) { setError("Progress must be a whole number from 0 to 100."); return; }
      const parsed = objectiveInput.safeParse({ goalId: editor.goalId, title, targetDate: targetDate || null, status, progress });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entered values."); return; }
      void run(() => saveObjectiveAction(parsed.data, item?.id), item ? "Objective saved" : "Objective added");
    }
  }

  return (
    <Dialog open onClose={close} title={`${item ? "Edit" : "New"} ${noun}`} footer={<>
      {item && <Button variant="ghost" destructive className={s.delete} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
      <Button onClick={close} disabled={busy}>Cancel</Button>
      <Button variant="primary" disabled={busy || confirmDelete} onClick={save}>{busy ? "Saving…" : item ? "Save" : `Add ${noun}`}</Button>
    </>}>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (!confirmDelete) save(); }}>
        <TextField label={isGoal ? "Goal" : "Objective"} value={title} maxLength={200} required autoFocus disabled={busy} help={isGoal ? undefined : "A measurable outcome, e.g. Apply to 6 internships."} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Target date (optional)" type="date" value={targetDate} disabled={busy} help={isGoal ? undefined : "Sets which horizon it appears under; otherwise uses the goal’s date."} onChange={(e) => setTargetDate(e.target.value)} />
        {isGoal ? <SelectField label="Colour" value={color} disabled={busy} onChange={(e) => setColor(e.target.value)}>
          {GOAL_COLORS.map((c, i) => <option key={c} value={c}>{COLOR_NAMES[i]}</option>)}
        </SelectField> : <TextField label="Manual progress % (optional)" inputMode="numeric" value={manual} placeholder="From tasks" disabled={busy} help="Leave empty to track progress from linked project tasks." onChange={(e) => setManual(e.target.value)} />}
        {item && <SelectField label="Status" value={status} disabled={busy} help={isGoal ? "Archived goals are hidden unless Show archived is on." : undefined} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Active</option><option value="done">Done</option>{isGoal && <option value="archived">Archived</option>}
        </SelectField>}
        {error && <Alert>{error}</Alert>}
        {confirmDelete && item && <Alert tone="warn" role="alert" action={<span className={s.actions}>
          <Button variant="danger" disabled={busy} onClick={() => void run(() => isGoal ? deleteGoalAction(item.id) : deleteObjectiveAction(item.id), isGoal ? "Goal deleted" : "Objective deleted")}>Delete {noun}</Button>
          <Button disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</Button>
        </span>}>
          {isGoal && editor.goal ? `Delete “${item.title}” and its ${editor.goal.objectives.length} objectives? Linked projects and tasks are kept.` : `Delete “${item.title}”? Its projects are unlinked, not deleted.`}
        </Alert>}
        <button type="submit" hidden disabled={busy || confirmDelete} />
      </form>
      {discard && <Alert tone="warn" className={s.discard} action={<span className={s.actions}><Button disabled={busy} onClick={() => setDiscard(false)}>Keep editing</Button><Button destructive disabled={busy} onClick={() => { if (!lock.current) onClose(); }}>Discard</Button></span>}>Discard changes?</Alert>}
    </Dialog>
  );
}
