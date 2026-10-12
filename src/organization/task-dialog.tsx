"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import { taskInput } from "@/lib/task-payload";
import type { TaskDialogOptions } from "@/lib/project-types";
import { addTaskDependencyAction, removeTaskDependencyAction, taskDialogOptionsAction } from "@/server/project-actions";
import { Icon } from "@/ui/icon";
import { createTaskAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/server/task-actions";
import { sydneyInstant, sydneyParts } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";

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
  useEffect(() => {
    let live = true;
    taskDialogOptionsAction(task?.id ?? null)
      .then((r) => live && (r.ok ? setOpts(r.options) : setOptsFailed(true)))
      .catch(() => live && setOptsFailed(true));
    return () => {
      live = false;
    };
  }, [task?.id]);
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? "");
  // Blockers are tracked as deltas against the server's list so the dirty check is stable while options load.
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null); // set once the task row exists but a blocker change failed
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
  const snap = JSON.stringify([title, date, time, priority, notes, remind, custom, done, projectId, milestoneId, added, removed]);
  const [initial] = useState(snap);
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
    const id = task?.id ?? savedId;
    const r = await (id ? updateTaskAction(id, parsed.data) : createTaskAction(parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      setBusy(false);
      if ("errors" in r) return setErrors(r.errors);
      return toast("Couldn't save that. Try again.", "error");
    }
    const tid = r.task.id;
    for (const [ids, act] of [
      [removed, removeTaskDependencyAction],
      [added, addTaskDependencyAction],
    ] as const) {
      for (const b of ids) {
        const d = await act(tid, b).catch(() => ({ ok: false, error: "failed" }) as const);
        if (!d.ok) {
          // The task itself is saved; keep the dialog open so the blocker can be changed.
          setBusy(false);
          setSavedId(tid);
          router.refresh();
          return toast("errors" in d ? "That would create a circular dependency. Pick a different task." : "Saved, but couldn't update blockers. Try again.", "error");
        }
        (ids === added ? setAdded : setRemoved)((l) => l.filter((x) => x !== b));
      }
    }
    if (task && done !== !!task.completedAt) {
      const t = await toggleTaskAction(task.id, done).catch(() => ({ ok: false }) as const);
      if (!t.ok) {
        setBusy(false);
        router.refresh();
        return toast("Saved, but couldn't change completion. Try again.", "error");
      }
    }
    setBusy(false);
    toast(task ? "Task saved" : "Task added");
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    const r = await deleteTaskAction(task.id).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return toast("Couldn't save that. Try again.", "error");
    toast("Task deleted");
    router.refresh();
    onClose();
  };

  if (confirm && task) {
    return (
      <Dialog
        open
        onClose={() => setConfirm(false)}
        title={`Delete "${task.title}"?`}
        initialFocus={() => document.querySelector<HTMLElement>("[data-cancel]")}
        actions={
          <>
            <Button variant="ghost" data-cancel="" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={remove}>
              DELETE TASK
            </Button>
          </>
        }
      >
        This task is deleted from LifeOS. It can&apos;t be undone.
      </Dialog>
    );
  }

  const relDisabled = !hasDue;
  const selfId = task?.id ?? savedId;
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
      width={480}
      sheet
      footerStart={
        task && (
          <button type="button" onClick={() => setConfirm(true)} className="rounded-6 px-1 py-2 text-[13px] text-red hover:underline max-tab:min-h-11">
            Delete task
          </button>
        )
      }
      actions={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {task ? "Save task" : "Add task"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Title" error={errors.title}>
          <Input value={title} maxLength={200} required autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-4 tab:grid-cols-2">
          <Field label="Due date" error={errors.dueDate}>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (!e.target.value) setTime("");
              }}
            />
          </Field>
          <Field label="Due time" error={errors.dueTime}>
            <Input type="time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {!optsFailed && (
          <>
            <Field label="Project" error={errors.projectId}>
              <Select
                value={projectId}
                disabled={!opts}
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
              </Select>
            </Field>
            <Field label="Milestone" error={errors.milestoneId}>
              <Select value={milestoneId} disabled={!opts || !projectId} onChange={(e) => setMilestoneId(e.target.value)}>
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-text-2">Blocked by</span>
              {blockers.map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-full border border-white/[.06] bg-white/[.04] py-1 pr-1 pl-3 text-[13px]">
                  <span className="mr-auto truncate">{b.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${b.title}`}
                    onClick={() => removeBlocker(b.id)}
                    className="grid size-7 place-items-center rounded-full text-text-3 hover:text-text max-tab:size-11"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
              <Select
                aria-label="Add blocker"
                value=""
                disabled={!opts || addable.length === 0}
                onChange={(e) => e.target.value && setAdded((l) => [...l, e.target.value])}
              >
                <option value="">Add a blocking task…</option>
                {addable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">None</option>
            <option value="3">Low (P3)</option>
            <option value="2">Medium (P2)</option>
            <option value="1">High (P1)</option>
          </Select>
        </Field>
        <Field label="Notes" error={errors.notes}>
          <Textarea rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Remind me" error={errors.remindAt} helper={relDisabled ? "Add a due date and time first." : undefined}>
          <Select value={remind} onChange={(e) => setRemind(e.target.value as Remind)}>
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
          </Select>
        </Field>
        {remind === "custom" && (
          <Field label="Reminder time">
            <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </Field>
        )}
        {task && <Checkbox label="Completed" checked={done} onChange={(e) => setDone(e.target.checked)} />}
        <button type="submit" hidden disabled={busy} />
      </form>
      {discard && (
        <div role="alert" className="mt-3 flex items-center gap-2 rounded-14 border border-[rgba(255,159,10,.3)] bg-[rgba(255,159,10,.08)] p-3 text-[13px] text-amber">
          <span className="mr-auto">Discard changes?</span>
          <Button size="xs" variant="ghost" onClick={() => setDiscard(false)}>
            Keep editing
          </Button>
          <Button size="xs" variant="secondary" onClick={onClose}>
            Discard
          </Button>
        </div>
      )}
    </Dialog>
  );
}
