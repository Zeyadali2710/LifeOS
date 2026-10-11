"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import { taskInput } from "@/lib/task-payload";
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

export function TaskDialog({ open, task, initialTitle = "", onClose }: { open: boolean; task?: TaskDTO; initialTitle?: string; onClose: () => void }) {
  // Remount per open/task so the form always starts from the right values.
  if (!open) return null;
  return <Form key={task?.id ?? "new"} task={task} initialTitle={initialTitle} onClose={onClose} />;
}

function Form({ task, initialTitle, onClose }: { task?: TaskDTO; initialTitle: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
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

  const submit = async () => {
    const remindAt = remindISO(remind, custom, date, time);
    const parsed = taskInput.safeParse({ title, notes, dueDate: date || null, dueTime: time || null, priority: priority ? Number(priority) : null, remindAt });
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
    if (remind !== "none" && !remindAt) errs.remindAt ??= "Enter a valid reminder time.";
    // An unchanged reminder on an existing task is not re-checked (matches the server).
    else if (remindAt && remindAt !== task?.remindAt && Date.parse(remindAt) <= Date.now()) errs.remindAt ??= "Reminder must be in the future.";
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    setBusy(true);
    const r = await (task ? updateTaskAction(task.id, parsed.data) : createTaskAction(parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      setBusy(false);
      if ("errors" in r) return setErrors(r.errors);
      return toast("Couldn't save that. Try again.", "error");
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
  return (
    <Dialog
      open
      onClose={onClose}
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
          <Button variant="ghost" onClick={onClose}>
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
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
