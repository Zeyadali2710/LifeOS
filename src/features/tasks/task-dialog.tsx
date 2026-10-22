"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import { taskInput } from "@/lib/task-payload";
import type { TaskDialogOptions } from "@/lib/project-types";
import { addTaskDependencyAction, removeTaskDependencyAction, taskDialogOptionsAction } from "@/server/project-actions";
import { createTaskAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/server/task-actions";
import { sydneyInstant, sydneyParts } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { Checkbox, SelectField, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { ConfirmDialog, Dialog } from "@/ui/overlay";

type Remind = "none" | "at" | "15m" | "1h" | "morning" | "custom";
const p2 = (n: number) => String(n).padStart(2, "0");
const localValue = (iso: string) => {
  const p = sydneyParts(new Date(iso));
  return `${p.year}-${p2(p.month)}-${p2(p.day)}T${p2(p.hour)}:${p2(p.minute)}`;
};
const fromLocal = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  return m ? sydneyInstant(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!) : null;
};

/** Reminder instant (ISO) for the chosen option, or null when it can't be computed. */
function remindISO(kind: Remind, custom: string, date: string, time: string): string | null {
  if (kind === "none") return null;
  if (kind === "custom") return fromLocal(custom)?.toISOString() ?? null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
  if (kind === "morning") return sydneyInstant(y, mo, d, 8).toISOString();
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!t) return null;
  const due = sydneyInstant(y, mo, d, +t[1]!, +t[2]!).getTime();
  return new Date(due - { at: 0, "15m": 15, "1h": 60 }[kind] * 60000).toISOString();
}

export function TaskDialog({
  open,
  task,
  initialTitle = "",
  defaultProjectId,
  onClose,
}: {
  open: boolean;
  task?: TaskDTO;
  initialTitle?: string;
  defaultProjectId?: string;
  onClose: () => void;
}) {
  // Remount per open/task so the form always starts from the right values.
  if (!open) return null;
  return <Form key={task?.id ?? "new"} task={task} initialTitle={initialTitle} defaultProjectId={defaultProjectId} onClose={onClose} />;
}

function Form({ task, initialTitle, defaultProjectId, onClose }: { task?: TaskDTO; initialTitle: string; defaultProjectId?: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [opts, setOpts] = useState<TaskDialogOptions | null>(null);
  const [optsFailed, setOptsFailed] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null); // set once the task row exists but a blocker change failed
  const [rev, setRev] = useState(0); // bumped after a partial save so the blocker list reloads from the server
  const selfId = task?.id ?? savedId;
  useEffect(() => {
    let live = true;
    taskDialogOptionsAction(selfId)
      .then((r) => live && (r.ok ? setOpts(r.options) : setOptsFailed(true)))
      .catch(() => live && setOptsFailed(true));
    return () => {
      live = false;
    };
  }, [selfId, rev]);
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? "");
  // Blockers are tracked as deltas against the server's list so the dirty check is stable while options load.
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [title, setTitle] = useState(task?.title ?? initialTitle);
  const [date, setDate] = useState(task?.dueDate ?? "");
  const [time, setTime] = useState(task?.dueTime ?? "");
  const [priority, setPriority] = useState(task?.priority ? String(task.priority) : "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [remind, setRemind] = useState<Remind>(task?.remindAt ? "custom" : "none");
  const [custom, setCustom] = useState(task?.remindAt ? localValue(task.remindAt) : "");
  const [done, setDone] = useState(!!task?.completedAt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const hasDue = !!date && !!time;
  const snapOf = (a: string[], r: string[], dn: boolean) => JSON.stringify([title, date, time, priority, notes, remind, custom, dn, projectId, milestoneId, a, r]);
  const snap = snapOf(added, removed, done);
  const [initial, setInitial] = useState(snap);
  // The task as saved on the server: the prop, or a new task whose row exists after a partial save.
  const existing = task ?? (savedId ? { id: savedId, title, completedAt: null } : null);
  const [discard, setDiscard] = useState(false);
  const close = () => (snap !== initial ? setDiscard(true) : onClose());

  const submit = async () => {
    if (busy) return; // Enter during the round-trip must not create a second task
    const remindAt = remindISO(remind, custom, date, time);
    const parsed = taskInput.safeParse({
      title,
      notes,
      dueDate: date || null,
      dueTime: time || null,
      priority: priority ? Number(priority) : null,
      remindAt,
      projectId: projectId || null,
      milestoneId: projectId && milestoneId ? milestoneId : null,
    });
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
    if (remind !== "none" && !remindAt) errs.remindAt ??= "Enter a valid reminder time.";
    // An unchanged reminder on an existing task is not re-checked (matches the server).
    else if (remindAt && remindAt !== task?.remindAt && Date.parse(remindAt) <= Date.now()) errs.remindAt ??= "Reminder must be in the future.";
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    setBusy(true);
    const id = selfId;
    const r = await (id ? updateTaskAction(id, parsed.data) : createTaskAction(parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      setBusy(false);
      if ("errors" in r) return setErrors(r.errors);
      return toast("Couldn't save that. Try again.", "error");
    }
    const tid = r.task.id;
    // After a partial save, the server holds everything but the unsaved blocker deltas / completion: make that the clean baseline.
    const partial = () => {
      setBusy(false);
      setSavedId(tid);
      setRev((n) => n + 1);
      setInitial(snapOf([], [], !!existing?.completedAt));
      router.refresh();
    };
    for (const [ids, act] of [
      [removed, removeTaskDependencyAction],
      [added, addTaskDependencyAction],
    ] as const) {
      for (const b of ids) {
        const d = await act(tid, b).catch(() => ({ ok: false, error: "failed" }) as const);
        if (!d.ok) {
          // The task itself is saved; keep the dialog open so the blocker can be changed.
          partial();
          return toast("errors" in d ? "That would create a circular dependency. Pick a different task." : "Saved, but couldn't update blockers. Try again.", "error");
        }
        (ids === added ? setAdded : setRemoved)((l) => l.filter((x) => x !== b));
      }
    }
    if (existing && done !== !!existing.completedAt) {
      const t = await toggleTaskAction(existing.id, done).catch(() => ({ ok: false }) as const);
      if (!t.ok) {
        partial();
        return toast("Saved, but couldn't change completion. Try again.", "error");
      }
    }
    setBusy(false);
    toast(task ? "Task saved" : "Task added");
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    const r = await deleteTaskAction(existing.id).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return toast("Couldn't save that. Try again.", "error");
    toast("Task deleted");
    router.refresh();
    onClose();
  };

  if (confirm && existing) {
    return (
      <ConfirmDialog
        open
        onClose={() => setConfirm(false)}
        onConfirm={() => void remove()}
        title={`Delete “${existing.title}”?`}
        body="This task is deleted from LifeOS. It can’t be undone."
        confirmLabel="Delete task"
        danger
        busy={busy}
      />
    );
  }

  const relDisabled = !hasDue;
  const titleOf = (id: string) => opts?.tasks.find((t) => t.id === id)?.title ?? opts?.blockedBy.find((t) => t.id === id)?.title ?? "task";
  const blockers = [...(opts?.blockedBy ?? []).filter((b) => !removed.includes(b.id)), ...added.map((id) => ({ id, title: titleOf(id) }))];
  const addable = (opts?.tasks ?? []).filter((t) => t.id !== selfId && !blockers.some((b) => b.id === t.id));
  const milestones = opts?.projects.find((p) => p.id === projectId)?.milestones ?? [];
  const removeBlocker = (id: string) => (added.includes(id) ? setAdded((l) => l.filter((x) => x !== id)) : setRemoved((l) => [...l, id]));
  return (
    <Dialog
      open
      onClose={close}
      title={task ? "Edit task" : "New task"}
      footer={
        <>
          {existing && (
            <Button variant="ghost" destructive style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>
              Delete task
            </Button>
          )}
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" disabled={busy} onClick={() => void submit()}>
            {task ? "Save task" : "Add task"}
          </Button>
        </>
      }
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="Title" value={title} maxLength={200} required autoFocus error={errors.title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <TextField
            label="Due date"
            type="date"
            value={date}
            error={errors.dueDate}
            onChange={(e) => {
              setDate(e.target.value);
              if (!e.target.value) setTime("");
            }}
          />
          <TextField label="Due time" type="time" value={time} disabled={!date} error={errors.dueTime} onChange={(e) => setTime(e.target.value)} />
        </div>
        {!optsFailed && (
          <>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <SelectField
                label="Project"
                value={projectId}
                disabled={!opts}
                error={errors.projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setMilestoneId("");
                }}
              >
                <option value="">No project</option>
                {opts?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Milestone" value={milestoneId} disabled={!opts || !projectId} error={errors.milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </SelectField>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>Blocked by</span>
              {blockers.map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--rule)", borderRadius: 6, padding: "2px 2px 2px 12px", fontSize: 13.5 }}>
                  <span style={{ marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                  <IconButton icon="close" label={`Remove ${b.title}`} small size={16} onClick={() => removeBlocker(b.id)} />
                </div>
              ))}
              <SelectField label="Add blocker" hideLabel value="" disabled={!opts || addable.length === 0} onChange={(e) => e.target.value && setAdded((l) => [...l, e.target.value])}>
                <option value="">Add a blocking task…</option>
                {addable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </SelectField>
            </div>
          </>
        )}
        <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">None</option>
          <option value="3">Low (P3)</option>
          <option value="2">Medium (P2)</option>
          <option value="1">High (P1)</option>
        </SelectField>
        <TextArea label="Notes" rows={4} maxLength={4000} value={notes} error={errors.notes} onChange={(e) => setNotes(e.target.value)} />
        <SelectField label="Remind me" value={remind} error={errors.remindAt} help={relDisabled ? "Add a due date and time first." : undefined} onChange={(e) => setRemind(e.target.value as Remind)}>
          <option value="none">No reminder</option>
          <option value="at" disabled={relDisabled}>
            At due time
          </option>
          <option value="15m" disabled={relDisabled}>
            15 minutes before
          </option>
          <option value="1h" disabled={relDisabled}>
            1 hour before
          </option>
          <option value="morning" disabled={!date}>
            The morning of (08:00)
          </option>
          <option value="custom">Custom…</option>
        </SelectField>
        {remind === "custom" && <TextField label="Reminder time" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        {existing && <Checkbox label="Completed" checked={done} onChange={(e) => setDone(e.target.checked)} />}
        <button type="submit" hidden disabled={busy} />
      </form>
      {discard && (
        <Alert
          tone="warn"
          action={
            <span style={{ display: "inline-flex", gap: 8 }}>
              <Button variant="text" size="sm" onClick={() => setDiscard(false)}>
                Keep editing
              </Button>
              <Button variant="text" size="sm" destructive onClick={onClose}>
                Discard
              </Button>
            </span>
          }
        >
          Discard changes?
        </Alert>
      )}
    </Dialog>
  );
}
