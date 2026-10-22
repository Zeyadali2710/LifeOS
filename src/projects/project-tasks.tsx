"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/calendar-types";
import type { MilestoneDTO } from "@/lib/project-types";
import { TaskDialog } from "@/organization/task-dialog";
import { setMilestoneDoneAction } from "@/server/project-actions";
import { toggleTaskAction } from "@/server/task-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { Checkbox, Select } from "@/legacy-ui/field";
import { Icon } from "@/legacy-ui/icon";
import { MilestoneDialog } from "./milestone-dialog";

const DAY = 86400000;
const utcDay = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fmt = (ymd: string) => new Date(utcDay(ymd) + 12 * 3600000).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

function dueMeta(due: string | null, today: string): { text: string; overdue: boolean } | null {
  if (!due) return null;
  if (due < today) return { text: `Overdue ${Math.round((utcDay(today) - utcDay(due)) / DAY)}d`, overdue: true };
  return { text: fmt(due), overdue: false };
}

type Dlg = { task?: TaskDTO } | null;

export function ProjectTasks({
  projectId,
  tasks,
  blockedBy,
  milestones,
  today,
  readOnly,
  openTaskId,
}: {
  projectId: string;
  tasks: TaskDTO[];
  blockedBy: Record<string, string[]>;
  milestones: MilestoneDTO[];
  today: string;
  readOnly: boolean;
  openTaskId?: string;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [ms, setMs] = useState("");
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [dlg, setDlg] = useState<Dlg>(() => {
    const t = openTaskId ? tasks.find((x) => x.id === openTaskId) : undefined;
    return t ? { task: t } : null;
  });
  const isDone = (t: TaskDTO) => optimistic[t.id] ?? !!t.completedAt;

  const toggle = async (t: TaskDTO, next: boolean) => {
    setOptimistic((o) => ({ ...o, [t.id]: next }));
    const r = await toggleTaskAction(t.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setOptimistic((o) => ({ ...o, [t.id]: !next }));
      return toast("Couldn't update. Try again.", "error");
    }
    router.refresh();
  };

  const list = ms ? tasks.filter((t) => t.milestoneId === ms) : tasks;
  const rows = [...list.filter((t) => !isDone(t)), ...list.filter(isDone)];

  const row = (t: TaskDTO) => {
    const d = isDone(t);
    const due = dueMeta(t.dueDate, today);
    const by = blockedBy[t.id] ?? [];
    return (
      <li key={t.id} className="flex items-center gap-2.5 rounded-14 px-2 py-2 hover:bg-[rgba(255,255,255,.03)]">
        <Checkbox hitArea checked={d} disabled={readOnly} aria-label={t.title} onChange={(e) => void toggle(t, e.target.checked)} />
        <button type="button" disabled={readOnly} onClick={() => setDlg({ task: t })} className={`min-w-0 flex-1 text-left text-[13.5px] break-words ${d ? "text-text-3 line-through" : "text-text"}`}>
          {t.title}
        </button>
        {!d && by.length > 0 && (
          <span title={`Blocked by ${by.join(", ")}`}>
            <Badge kind="tag" tone="amber">
              <Icon name="block" size={11} /> Blocked
              <span className="sr-only"> by {by.join(", ")}</span>
            </Badge>
          </span>
        )}
        {due && !d && <span className={`font-mono text-[11.5px] ${due.overdue ? "text-red" : "text-text-3"}`}>{due.text}</span>}
        {(t.priority === 1 || t.priority === 2) && (
          <Badge kind="tag" tone={t.priority === 1 ? "red" : "amber"}>
            P{t.priority}
            <span className="sr-only">{t.priority === 1 ? "Priority high" : "Priority medium"}</span>
          </Badge>
        )}
      </li>
    );
  };

  return (
    <div className="glass-card rounded-24 p-5">
      <div className="mb-3 flex items-center gap-2">
        {milestones.length > 0 && (
          <Select aria-label="Filter by milestone" value={ms} onChange={(e) => setMs(e.target.value)} className="max-w-[220px]">
            <option value="">All milestones</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        )}
        <span className="flex-1" />
        {!readOnly && (
          <Button variant="secondary" size="xs" onClick={() => setDlg({})}>
            <Icon name="add" size={14} /> New task
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="py-3">
          <p className="text-[14px] font-medium">No tasks in this project.</p>
          {!readOnly && (
            <button type="button" onClick={() => setDlg({})} className="mt-1 text-[12.5px] text-text-2 underline hover:text-text">
              Add a task
            </button>
          )}
        </div>
      ) : (
        <ul>{rows.map(row)}</ul>
      )}
      <TaskDialog open={!!dlg} task={dlg?.task} defaultProjectId={projectId} onClose={() => setDlg(null)} />
    </div>
  );
}

export function MilestoneList({ projectId, milestones, today, readOnly }: { projectId: string; milestones: MilestoneDTO[]; today: string; readOnly: boolean }) {
  const router = useRouter();
  const { toast } = useShell();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [dlg, setDlg] = useState<{ milestone?: MilestoneDTO } | null>(null);

  const toggle = async (m: MilestoneDTO, next: boolean) => {
    setOptimistic((o) => ({ ...o, [m.id]: next }));
    const r = await setMilestoneDoneAction(m.id, next).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setOptimistic((o) => ({ ...o, [m.id]: !next }));
      return toast("Couldn't update. Try again.", "error");
    }
    router.refresh();
  };

  return (
    <div className="mt-3">
      <ul>
        {milestones.map((m) => {
          const done = optimistic[m.id] ?? !!m.completedAt;
          const overdue = !done && !!m.dueDate && m.dueDate < today;
          return (
            <li key={m.id} className="flex items-center gap-2.5 rounded-16 px-2 py-2 hover:bg-[rgba(255,255,255,.03)]">
              <Checkbox hitArea disabled={readOnly} checked={done} aria-label={m.title} onChange={(e) => void toggle(m, e.target.checked)} />
              <span className={`min-w-0 flex-1 text-[13.5px] break-words ${done ? "text-text-3 line-through" : ""}`}>{m.title}</span>
              {m.dueDate && <span className={`font-mono text-[11.5px] ${overdue ? "text-red" : "text-text-3"}`}>{fmt(m.dueDate)}</span>}
              <span className="font-mono text-[11.5px] text-text-3">
                {m.doneCount}/{m.taskCount} tasks
              </span>
              {!readOnly && (
                <button type="button" aria-label="Edit milestone" onClick={() => setDlg({ milestone: m })} className="grid size-7 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11">
                  <Icon name="edit" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <Button variant="secondary" size="xs" className="mt-2" onClick={() => setDlg({})}>
          <Icon name="add" size={14} /> Add milestone
        </Button>
      )}
      <MilestoneDialog open={!!dlg} projectId={projectId} milestone={dlg?.milestone} onClose={() => setDlg(null)} />
    </div>
  );
}
