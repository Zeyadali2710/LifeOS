import Link from "next/link";
import { relativeTime } from "@/career/repo-card";
import { CATEGORY_LABEL, type ProjectCardDTO } from "@/lib/project-types";
import { HealthDot, PriorityTag, StatusChip } from "./status";
import { ProgressRing } from "./progress-ring";

const dayNum = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86400000;
};

export function ProjectCard({ card, today, now }: { card: ProjectCardDTO; today: string; now: string }) {
  const { project: p, progress, health, nextTask, lastActivity, timeline: tl } = card;
  const due = nextTask?.dueDate ?? null;
  const dueLeft = due ? dayNum(due) - dayNum(today) : null;
  const dueCls = dueLeft === null ? "text-text-3" : dueLeft < 0 ? "text-red" : dueLeft <= 3 ? "text-amber" : "text-text-3";
  const barCls = health === "behind" ? "bg-red" : health === "at_risk" ? "bg-amber" : "bg-accent";
  const pct = tl ? Math.max(0, Math.min(100, tl.pct)) : 0;
  return (
    <Link
      href={`/projects/${p.id}`}
      className="flex flex-col glass-card rounded-24 p-5 text-text transition duration-150 hover:-translate-y-px hover:border-white/[.16]"
    >
      <span className="mb-3 flex items-center gap-2.5">
        <PriorityTag priority={p.priority} />
        <span className="text-[10.5px] font-medium tracking-[.1em] text-text-3 uppercase">{CATEGORY_LABEL[p.category]}</span>
        {p.status !== "active" && <StatusChip status={p.status} />}
        <span className="flex-1" />
        <HealthDot health={health} />
      </span>
      <span className="mb-3 flex items-center justify-between gap-3">
        <span className="min-w-0 font-display text-[20px] leading-[1.2]">{p.name}</span>
        <ProgressRing pct={progress.pct} size={36} stroke={3} label={`${p.name} progress`} done={p.status === "done"} />
      </span>
      <span className="mb-3 flex items-center justify-between gap-3 text-[13.5px]">
        {progress.basis === "none" ? (
          <span className="text-text-3">No tasks yet</span>
        ) : nextTask ? (
          <>
            <span className="min-w-0 truncate text-text-2">Next · {nextTask.title}</span>
            {due && <span className={`shrink-0 text-[12.5px] ${dueCls}`}>{due}</span>}
          </>
        ) : (
          <span className="text-text-3">No open tasks</span>
        )}
      </span>
      {tl && p.targetDate && (
        <span
          role="img"
          aria-label={tl.daysLeft >= 0 ? `Target ${p.targetDate}, ${tl.daysLeft} days left` : `Target ${p.targetDate}, overdue by ${-tl.daysLeft} days`}
          className="relative mb-3 block h-1 overflow-hidden rounded-full bg-white/[.08]"
        >
          <span className={`absolute inset-y-0 left-0 ${barCls}`} style={{ width: `${pct}%` }} />
          <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `calc(${pct}% - 1px)` }} />
        </span>
      )}
      <span className="text-[12.5px] text-text-3">
        {lastActivity ? `Last activity ${relativeTime(lastActivity.at, now)} · ${lastActivity.label}` : "No activity yet"}
      </span>
    </Link>
  );
}
