import Link from "next/link";
import { rankPriorities, type Digest, type DigestEvent } from "@/lib/digest";
import { EmptyState } from "@/ui/empty-state";
import { SectionHeader } from "@/ui/section-header";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
const TONE = { red: "bg-red", amber: "bg-amber", cyan: "bg-cyan", neutral: "bg-text-3" } as const;
const when = (e: DigestEvent) => (e.allDay ? "All day" : `${hm(e.start)}–${hm(e.end)}`);

export function Priorities({ digest }: { digest: Digest }) {
  const items = rankPriorities(digest);
  return (
    <section aria-labelledby="h-priorities">
      <SectionHeader id="h-priorities" label="Priorities" link={{ href: "/briefings", label: "Briefings →" }} />
      {items.length === 0 ? (
        <EmptyState icon="check_circle" title="Nothing needs you right now." body="Overdue tasks, approvals, important email, calendar conflicts, CI failures, budgets and neglected goals rank here." />
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5">
          {items.map((p, i) => (
            <li key={p.key}>
              <Link href={p.href} className="glass-card flex h-full items-start gap-3 rounded-22 p-3.5 text-text hover:!border-white/20">
                <span className="mt-0.5 text-[11px] text-text-3">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14px] leading-snug break-words">{p.label}</span>
                  <span className="flex items-center gap-1.5 text-[11.5px] text-text-3"><span className={`size-1.5 rounded-full ${TONE[p.tone]}`} />{p.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Today({ digest, className = "" }: { digest: Digest; className?: string }) {
  const empty = !digest.events.length && !digest.tasks.length;
  return (
    <section aria-labelledby="h-today" className={className}>
      <SectionHeader id="h-today" label="Today" link={{ href: "/organization", label: "Open calendar →" }} />
      {empty ? (
        <EmptyState icon="event_busy" title={digest.calendarConnected ? "Nothing scheduled today." : "Your day isn't connected yet."}
          body={digest.calendarConnected ? "No events and no tasks due. Add a task in Organization if something comes up." : "Connect a calendar in Settings → Connections; tasks you add in Organization appear here too."} />
      ) : (
        <div className="glass-card flex flex-col gap-1 rounded-24 p-3">
          {digest.events.map((e, i) => (
            <div key={`e${i}`} className="flex items-baseline gap-3 rounded-12 px-2 py-1.5">
              <span className="w-28 shrink-0 text-[12px] text-text-3">{when(e)}</span>
              <span className="min-w-0 flex-1 text-[13.5px] break-words">{e.title}</span>
              <span className="hidden text-[11px] text-text-3 tab:inline">{e.calendar}</span>
            </div>
          ))}
          {digest.tasks.length > 0 && digest.events.length > 0 && <div className="mx-2 my-1 h-px bg-white/[.06]" />}
          {digest.tasks.map((t) => (
            <Link key={t.id} href="/organization#tasks" className="flex items-baseline gap-3 rounded-12 px-2 py-1.5 text-text hover:bg-white/[.03]">
              <span className={`w-28 shrink-0 text-[12px] ${t.overdue ? "text-red" : "text-text-3"}`}>{t.overdue ? "Overdue" : t.dueAt ? `Due ${hm(t.dueAt)}` : "Today"}</span>
              <span className="min-w-0 flex-1 text-[13.5px] break-words">{t.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function Upcoming({ digest }: { digest: Digest }) {
  const days = digest.upcoming.filter((d) => d.events.length);
  return (
    <section aria-labelledby="h-upcoming" className="hidden tab:block">
      <SectionHeader id="h-upcoming" label="Upcoming" link={{ href: "/organization?view=week", label: "Week view →" }} />
      {days.length === 0 ? (
        <EmptyState icon="date_range" title="Nothing upcoming." body={digest.calendarConnected ? "No events in the next six days." : "The next six days appear here once your calendar is connected."} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {days.map((d) => (
            <div key={d.day} className="glass-card flex flex-col gap-1.5 rounded-22 p-3.5">
              <span className="text-[10.5px] tracking-[.12em] text-text-3">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()}</span>
              {d.events.slice(0, 4).map((e, i) => <span key={i} className="flex gap-2 text-[13px]"><span className="shrink-0 text-text-3">{e.allDay ? "All day" : hm(e.start)}</span><span className="min-w-0 truncate">{e.title}</span></span>)}
              {d.events.length > 4 && <span className="text-[11.5px] text-text-3">+{d.events.length - 4} more</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
