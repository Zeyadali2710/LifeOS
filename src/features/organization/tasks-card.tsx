"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import { quickAddTaskAction, toggleTaskAction } from "@/server/task-actions";
import { sydneyParts } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { Section } from "@/ui/layout";
import { TaskDialog } from "@/features/tasks/task-dialog";
import s from "./organization.module.css";

const DAY = 86400000;
const utcDay = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const wk = (ymd: string) => new Date(utcDay(ymd) + 12 * 3600000).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });

function dueMeta(t: TaskDTO, today: string): { text: string; overdue: boolean } | null {
  if (!t.dueDate) return null;
  if (t.dueDate < today) return { text: `Overdue ${Math.round((utcDay(today) - utcDay(t.dueDate)) / DAY)}d`, overdue: true };
  if (t.dueDate === today) return t.dueTime ? { text: t.dueTime, overdue: false } : null;
  return { text: wk(t.dueDate), overdue: false };
}

type Dlg = { task?: TaskDTO; initialTitle?: string } | null;

export function TasksCard({ tasks, allOpen, completed, today }: { tasks: TaskDTO[]; allOpen: TaskDTO[]; completed: TaskDTO[]; today: string }) {
  const router = useRouter();
  const { toast } = useShell();
  const [all, setAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // ok: the server confirmed it, so the next server props win and the entry is dropped (WR-B08)
  const [optimistic, setOptimistic] = useState<Record<string, { done: boolean; ok: boolean }>>({});
  const [synced, setSynced] = useState(tasks);
  if (synced !== tasks) {
    setSynced(tasks);
    setOptimistic((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !v.ok)));
  }
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const m = timers.current;
    return () => m.forEach(clearTimeout);
  }, []);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [say, setSay] = useState("");
  const [title, setTitle] = useState("");
  const [dlg, setDlg] = useState<Dlg>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());

  const isDone = (t: TaskDTO) => optimistic[t.id]?.done ?? !!t.completedAt;
  const base = all ? allOpen : tasks;
  const list = showDone ? [...base, ...completed.filter((c) => !base.some((b) => b.id === c.id))] : base;
  const rows = [...list.filter((t) => !isDone(t)), ...list.filter((t) => isDone(t) && (showDone || !collapsed.has(t.id)))];
  const total = base.length;
  const doneCount = base.filter(isDone).length;

  const toggle = async (t: TaskDTO, next: boolean) => {
    setOptimistic((o) => ({ ...o, [t.id]: { done: next, ok: false } }));
    setSay(next ? "Task completed" : "Task reopened");
    clearTimeout(timers.current.get(t.id));
    if (next) timers.current.set(t.id, setTimeout(() => setCollapsed((c) => new Set(c).add(t.id)), 4000));
    else
      setCollapsed((c) => {
        const n = new Set(c);
        n.delete(t.id);
        return n;
      });
    const r = await toggleTaskAction(t.id, next).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      clearTimeout(timers.current.get(t.id));
      setOptimistic((o) => (o[t.id]?.done === next ? { ...o, [t.id]: { done: !next, ok: true } } : o));
      toast("Couldn't save that. Try again.", "error");
      return;
    }
    setOptimistic((o) => (o[t.id]?.done === next ? { ...o, [t.id]: { done: next, ok: true } } : o)); // a newer toggle wins
    router.refresh();
  };

  const quickAdd = async () => {
    const v = title.trim();
    if (!v) return;
    setTitle("");
    const r = await quickAddTaskAction(v).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      setTitle(v);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast("Task added");
    router.refresh();
    inputRef.current?.focus();
  };

  const row = (t: TaskDTO) => {
    const d = isDone(t);
    const due = dueMeta(t, today);
    const remindFuture = t.remindAt && Date.parse(t.remindAt) > now;
    const rp = t.remindAt ? sydneyParts(new Date(t.remindAt)) : null;
    return <li key={t.id} className={s.task}>
      <button type="button" className={s.check} role="checkbox" aria-checked={d} aria-label={t.title} onClick={() => void toggle(t, !d)}>{d && <Icon name="check" size={15} />}</button>
      <button type="button" onClick={() => setDlg({ task: t })} className={`${s.taskTitle} ${d ? s.done : ""}`}>{t.title}{remindFuture && rp && <Icon name="alarm" size={14} label={`Reminder ${rp.weekday} ${String(rp.hour).padStart(2, "0")}:${String(rp.minute).padStart(2, "0")}`} />}</button>
      <span className={`${s.due} ${due?.overdue ? s.overdue : t.dueDate === today ? s.dueToday : ""}`}>{t.priority && <span aria-label={`Priority ${t.priority}`}>P{t.priority} · </span>}{due?.text ?? (t.dueDate === today ? "Today" : "")}</span>
    </li>;
  };

  const groups = (() => {
    const g: [string, TaskDTO[]][] = [
      ["Overdue", rows.filter((t) => t.dueDate && t.dueDate < today)],
      ["Today", rows.filter((t) => t.dueDate === today)],
      ["Upcoming", rows.filter((t) => t.dueDate && t.dueDate > today)],
      ["No date", rows.filter((t) => !t.dueDate)],
    ];
    return g.filter(([, l]) => l.length);
  })();

  return (
    <Section id="o-tasks" label={`Tasks · ${all ? "all open" : "today"} · ${total - doneCount} open`} meta={<Button variant="text" size="sm" onClick={() => setDlg({})}>+ Add</Button>}>
      <div className={s.toggles}><button type="button" aria-pressed={all} onClick={() => setAll(!all)}>{all ? "Show today only" : "Show all open tasks"}</button><button type="button" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide completed" : "Show completed"}</button></div>
      {rows.length === 0 ? <div className={s.note}>{total > 0 && doneCount === total ? <>All done for today. {doneCount} completed.</> : <>No tasks {all ? "yet" : "for today"}. Add one below, or press Enter after typing a title.</>}</div>
        : all ? groups.map(([name, list]) => <div key={name}><h3 className={s.group}>{name}</h3><ul className={s.list}>{list.map(row)}</ul></div>) : <ul className={s.list}>{rows.map(row)}</ul>}
      <div className={s.quick}>
        <input ref={inputRef} className={s.quickInput} value={title} maxLength={200} aria-label="New task" placeholder="Add a task, press ↵" onChange={e => setTitle(e.target.value)} onKeyDown={e => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (e.shiftKey) { setDlg({ initialTitle: title.trim() }); setTitle(""); }
          else void quickAdd();
        }} />
        <IconButton small icon="edit_note" label="Add task with details" onClick={() => { setDlg({ initialTitle: title.trim() }); setTitle(""); }} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">{say}</p>
      <TaskDialog open={!!dlg} task={dlg?.task} initialTitle={dlg?.initialTitle} onClose={() => setDlg(null)} />
    </Section>
  );
}
