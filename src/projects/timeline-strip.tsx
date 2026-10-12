import type { TaskDTO } from "@/lib/calendar-types";
import type { MilestoneDTO } from "@/lib/project-types";

const DAY = 86400000;
const ms = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fmt = (ymd: string) => new Date(ms(ymd) + 12 * 3600000).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

type Item = { date: string; kind: "milestone" | "task" | "target"; title: string; state: "done" | "overdue" | "open" };

export function TimelineStrip({ milestones, tasks, targetDate, today }: { milestones: MilestoneDTO[]; tasks: TaskDTO[]; targetDate: string | null; today: string }) {
  const items: Item[] = [
    ...milestones
      .filter((m) => m.dueDate)
      .map((m): Item => ({
        date: m.dueDate!,
        kind: "milestone",
        title: m.title,
        state: m.completedAt ? "done" : m.dueDate! < today ? "overdue" : "open",
      })),
    ...tasks.filter((t) => t.dueDate && !t.completedAt).map((t): Item => ({ date: t.dueDate!, kind: "task", title: t.title, state: t.dueDate! < today ? "overdue" : "open" })),
    ...(targetDate ? [{ date: targetDate, kind: "target", title: "Target date", state: "open" } as Item] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (items.length === 0) return <p className="text-[13px] text-text-2">Add a target date or milestone to see the timeline.</p>;

  const t0 = ms(today);
  const lo = Math.min(t0, ms(items[0]!.date));
  const hi = Math.max(t0 + 14 * DAY, ms(items[items.length - 1]!.date));
  const pos = (ymd: string) => `${((ms(ymd) - lo) / (hi - lo)) * 100}%`;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 7 * DAY) ticks.push(t);
  const color = (s: Item["state"]) => (s === "done" ? "bg-green" : s === "overdue" ? "bg-red" : "bg-white/40");

  return (
    <div>
      <div className="overflow-x-auto">
        <div aria-hidden="true" className="relative h-[84px] min-w-[640px]">
          <div className="absolute inset-x-0 top-8 h-px bg-white/[.12]" />
          {ticks.map((t) => (
            <span key={t} className="absolute top-[38px] -translate-x-1/2 font-mono text-[9.5px] text-text-3" style={{ left: `${((t - lo) / (hi - lo)) * 100}%` }}>
              {fmt(new Date(t).toISOString().slice(0, 10))}
            </span>
          ))}
          <div className="absolute top-2 bottom-4 w-[1.5px] bg-accent" style={{ left: pos(today) }} />
          {items.map((i, n) => (
            <div key={n} className="absolute top-[26px] -translate-x-1/2" style={{ left: pos(i.date) }}>
              {i.kind === "task" ? (
                <span className={`block size-2 rounded-full ${color(i.state)}`} />
              ) : (
                <span className={`block size-3 rotate-45 ${i.kind === "target" ? "bg-accent" : color(i.state)}`} />
              )}
              <span className="absolute top-8 left-1/2 max-w-[90px] -translate-x-1/2 truncate text-[10.5px] whitespace-nowrap text-text-2">{i.title}</span>
            </div>
          ))}
        </div>
      </div>
      <ol className="sr-only">
        {items.map((i, n) => (
          <li key={n}>
            {i.kind === "milestone"
              ? `${fmt(i.date)}: Milestone ${i.title} (${i.state})`
              : i.kind === "target"
                ? `${fmt(i.date)}: Target date`
                : `${fmt(i.date)}: Task ${i.title}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
