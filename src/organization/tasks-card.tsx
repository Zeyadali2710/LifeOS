"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import { quickAddTaskAction, toggleTaskAction } from "@/server/task-actions";
import { sydneyParts } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Checkbox, Input } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { TaskDialog } from "./task-dialog";

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
  const [menu, setMenu] = useState(false);
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
    return (
      <li key={t.id} className="flex animate-[lo-fade_200ms_ease-out] items-center gap-2.5 rounded-14 px-2 py-2 hover:bg-[rgba(255,255,255,.03)]">
        <Checkbox hitArea checked={d} aria-label={t.title} onChange={(e) => void toggle(t, e.target.checked)} />
        <button
          type="button"
          onClick={() => setDlg({ task: t })}
          className={`min-w-0 flex-1 text-left text-[13.5px] break-words ${d ? "text-text-3 line-through" : "text-text"}`}
        >
          {t.title}
        </button>
        {due && <span className={`font-mono text-[11.5px] ${due.overdue ? "text-red" : "text-text-3"}`}>{due.text}</span>}
        {(t.priority === 1 || t.priority === 2) && (
          <Badge kind="tag" tone={t.priority === 1 ? "red" : "amber"}>
            P{t.priority}
            <span className="sr-only">{t.priority === 1 ? "Priority high" : "Priority medium"}</span>
          </Badge>
        )}
        {remindFuture && rp && (
          <span aria-label={`Reminder ${rp.weekday} ${String(rp.hour).padStart(2, "0")}:${String(rp.minute).padStart(2, "0")}`} className="text-text-3">
            <Icon name="alarm" size={14} />
          </span>
        )}
      </li>
    );
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
    <section id="tasks" aria-label="Tasks" className="glass-card rounded-24 p-5">
      <div className="relative mb-3 flex items-center gap-2">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.1em] text-text-2">{all ? "TASKS · ALL OPEN" : "TASKS · TODAY"}</h2>
        <span className="font-mono text-[11px] text-text-3">
          {doneCount} / {total}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Task list options"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="grid size-7 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11"
        >
          <Icon name="more_horiz" size={18} />
        </button>
        {menu && (
          <div role="group" aria-label="Task list options" className="absolute top-8 right-0 z-10 flex glass-menu w-52 flex-col rounded-24 p-1.5">
            <button type="button" className="rounded-[18px] px-3 py-2 text-left text-[13px] hover:bg-fill-2" onClick={() => (setAll(!all), setMenu(false))}>
              {all ? "Show today only" : "Show all open tasks"}
            </button>
            <button type="button" className="rounded-[18px] px-3 py-2 text-left text-[13px] hover:bg-fill-2" onClick={() => (setShowDone(!showDone), setMenu(false))}>
              {showDone ? "Hide completed" : "Show completed"}
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-3">
          {total > 0 && doneCount === total ? (
            <>
              <p className="text-[14px] font-medium">All done for today.</p>
              <p className="mt-1 font-mono text-[11px] text-text-3">{doneCount} completed</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-medium">No tasks for today.</p>
              <p className="mt-1 text-[12.5px] text-text-2">Add one below, or press ↵ after typing a title.</p>
            </>
          )}
        </div>
      ) : all ? (
        groups.map(([name, l]) => (
          <div key={name} className="mt-2">
            <h3 className="font-mono text-[10.5px] tracking-[0.1em] text-text-3">{name}</h3>
            <ul>{l.map(row)}</ul>
          </div>
        ))
      ) : (
        <ul className="mt-1">{rows.map(row)}</ul>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={title}
          maxLength={200}
          aria-label="New task"
          placeholder="Add a task, press ↵"
          className="max-tab:h-11"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (e.shiftKey) {
              setDlg({ initialTitle: title.trim() });
              setTitle("");
            } else void quickAdd();
          }}
        />
        <button
          type="button"
          aria-label="Add task with details"
          onClick={() => {
            setDlg({ initialTitle: title.trim() });
            setTitle("");
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11"
        >
          <Icon name="edit_note" size={18} />
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {say}
      </p>
      <TaskDialog open={!!dlg} task={dlg?.task} initialTitle={dlg?.initialTitle} onClose={() => setDlg(null)} />
    </section>
  );
}
