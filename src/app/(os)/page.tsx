import Link from "next/link";
import { checkHealth } from "@/server/health";
import { dateLine, lead } from "@/server/home";
import { unreadImportantCount } from "@/server/notifications";
import { requireOwner } from "@/server/session";
import { greeting } from "@/server/time";
import { getSydneyWeather } from "@/server/weather";
import { counts } from "@/server/agents/runs";
import { db } from "@/server/db/client";
import { recentActivity } from "@/server/events";
import { ActivityList, Item as ActivityItem } from "@/shell/activity-list";
import { SystemTile } from "@/shell/system-tile";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { SectionHeader } from "@/ui/section-header";
import { StatusTile } from "@/ui/status-tile";

function Section({
  id,
  label,
  link,
  icon,
  title,
  body,
  className = "",
}: {
  id: string;
  label: string;
  link?: { href: string; label: string };
  icon: IconName;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <SectionHeader id={id} label={label} link={link} />
      <EmptyState icon={icon} title={title} body={body} />
    </section>
  );
}

export default async function HomePage() {
  const { user } = await requireOwner();
  const now = new Date();
  const [health, weather, unreadImportant, agentCounts, agentActivity] = await Promise.all([
    checkHealth(now.getTime()),
    getSydneyWeather(),
    unreadImportantCount().catch(() => 0),
    counts(db()).catch(() => ({ running: 0, queued: 0, approvalsWaiting: 0 })),
    recentActivity(db(), 50)
      .then((a) => a.filter((x) => x.type.startsWith("agent.")).slice(0, 5))
      .catch(() => []),
  ]);
  const first = user.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <header>
        <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-text-3 uppercase">{dateLine(now, weather)}</p>
        <h1 className="mt-2 text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">
          {first ? `${greeting(now)}, ${first}.` : `${greeting(now)}.`}
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-normal text-text-2 tab:text-[17px]">
          {lead({ unreadImportant, health }).map((p, i) => (
            <span key={i} className={p.strong ? "text-text" : undefined}>
              {p.text}
            </span>
          ))}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusTile label="AGENTS" value={`${agentCounts.running} running`} dot="indigo" href="/agents" />
          <StatusTile label="APPROVALS" value={`${agentCounts.approvalsWaiting} waiting`} dot="amber" href="/approvals" />
          <SystemTile initial={health} />
        </div>
      </header>

      <Section
        id="h-priorities"
        label="Priorities"
        icon="priority_high"
        title="Nothing is ranked yet."
        body="Priorities appear here once agents are connected and have something to rank."
      />

      <div className="flex flex-wrap gap-6">
        <Section
          id="h-today"
          label="Today"
          link={{ href: "/organization", label: "Open calendar →" }}
          icon="event_busy"
          title="Your day isn't connected yet."
          body="Today shows events and tasks once a calendar is connected in Organization."
          className="min-w-0 flex-[1.5_1_520px]"
        />
        <div className="min-w-0 flex-[1_1_340px]">
          <Link
            href="/agents"
            className="mb-6 flex min-h-11 items-center justify-between rounded-12 border border-[rgba(255,255,255,.07)] px-3.5 font-mono text-[11px] font-medium tracking-[0.08em] text-text-2 uppercase tab:hidden"
          >
            {agentCounts.running} agents running
            <Icon name="chevron_right" size={18} />
          </Link>
          <ActivityList />
        </div>
      </div>

      <div className="hidden flex-wrap gap-6 tab:flex">
        <Section
          id="h-projects"
          label="Active projects"
          link={{ href: "/projects", label: "All projects →" }}
          icon="deployed_code"
          title="No projects yet."
          body="Projects appear here once GitHub is connected."
          className="min-w-0 flex-[1.5_1_520px]"
        />
        {agentActivity.length > 0 ? (
          <section aria-labelledby="h-agents" className="min-w-0 flex-[1_1_340px]">
            <SectionHeader id="h-agents" label="Agent activity" link={{ href: "/agents", label: "Agent command →" }} />
            <ul className="rounded-14 border border-[rgba(255,255,255,.07)] bg-surface p-1.5">
              {agentActivity.map((a) => (
                <ActivityItem key={a.id} a={a} fresh={false} />
              ))}
            </ul>
          </section>
        ) : (
          <Section
            id="h-agents"
            label="Agent activity"
            link={{ href: "/agents", label: "Agent command →" }}
            icon="memory"
            title="No agents running."
            body="Agents run when you ask LifeOS or when work is delegated. Ask something in the assistant to start."
            className="min-w-0 flex-[1_1_340px]"
          />
        )}
      </div>

      <Section
        id="h-upcoming"
        label="Upcoming"
        icon="date_range"
        title="Nothing upcoming."
        body="The next six days appear here once your calendar is connected."
        className="hidden tab:block"
      />
    </div>
  );
}
