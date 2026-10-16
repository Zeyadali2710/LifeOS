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
import { loadActiveProjects } from "@/server/project-queries";
import { loadDigest } from "@/server/digest";
import { Priorities, Today, Upcoming } from "@/home/digest-sections";
import { rankPriorities } from "@/lib/digest";
import { ActiveProjects } from "@/projects/active-projects";
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
  const [health, weather, unreadImportant, agentCounts, agentActivity, activeProjects, digest] = await Promise.all([
    checkHealth(now.getTime()),
    getSydneyWeather(),
    unreadImportantCount().catch(() => 0),
    counts(db()).catch(() => ({ running: 0, queued: 0, approvalsWaiting: 0 })),
    recentActivity(db(), 50)
      .then((a) => a.filter((x) => x.type.startsWith("agent.")).slice(0, 5))
      .catch(() => []),
    loadActiveProjects(db(), now).catch(() => []),
    loadDigest(db(), now),
  ]);
  const first = user.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <header>
        <p className="text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">{dateLine(now, weather)}</p>
        <h1 className="mt-2.5 font-display text-[clamp(36px,5.2vw,76px)] leading-[.92] font-normal tracking-[-0.015em] [text-wrap:pretty]">
          {first ? (
            <>
              {greeting(now)}, <span className="text-amber italic">{first}</span>.
            </>
          ) : (
            `${greeting(now)}.`
          )}
        </h1>
        <p className="mt-2.5 max-w-[640px] text-[15px] leading-normal text-text-2 tab:text-[17px]">
          {lead({ unreadImportant: Math.max(unreadImportant, rankPriorities(digest).length), health }).map((p, i) => (
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

      <Priorities digest={digest} />

      <div className="flex flex-wrap gap-6">
        <Today digest={digest} className="min-w-0 flex-[1.5_1_520px]" />
        <div className="min-w-0 flex-[1_1_340px]">
          <Link
            href="/agents"
            className="mb-6 flex min-h-11 items-center justify-between glass-card rounded-24 px-3.5 text-[11px] font-medium tracking-[0.08em] text-text-2 uppercase tab:hidden"
          >
            {agentCounts.running} agents running
            <Icon name="chevron_right" size={18} />
          </Link>
          <ActivityList />
        </div>
      </div>

      <div className="hidden flex-wrap gap-6 tab:flex">
        <div className="min-w-0 flex-[1.5_1_520px]">
          <ActiveProjects cards={activeProjects} />
        </div>
        {agentActivity.length > 0 ? (
          <section aria-labelledby="h-agents" className="min-w-0 flex-[1_1_340px]">
            <SectionHeader id="h-agents" label="Agent activity" link={{ href: "/agents", label: "Agent command →" }} />
            <ul className="glass-card rounded-24 p-2">
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

      <Upcoming digest={digest} />
    </div>
  );
}
